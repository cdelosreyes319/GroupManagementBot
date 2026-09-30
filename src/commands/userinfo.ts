// /userinfo
// Arguments: user (Discord user), source (optional, autocomplete of source names)
// Access: configurable
// What it does: shows a player's info card — avatar, EF/Corps rank, regiments,
// special assignments, imperial honours, and one table per stats source.
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type GuildMember,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import type { RoleLabel } from "../storage/types";
import { getAccountLookup } from "../services/accountLookup";
import { getStatsService } from "../services/statsServiceInstance";
import { getGroupRankLines, getHeadshot } from "../services/robloxInfo";
import { buildStatCells, renderStatTable } from "../services/statsFormatter";
import { buildUserInfoCard, warnEmbed, type UserInfoTable, type DisplayedRole } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";

export const access: AccessLevel = "configurable";

let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Show a player's info card: ranks, assignments, regiments and stats.")
  .setDMPermission(false)
  .addUserOption((o) => o.setName("user").setDescription("The Discord user.").setRequired(true))
  .addStringOption((o) => o.setName("source").setDescription("A specific stats source.").setAutocomplete(true));

// Autocomplete for the `source` option: enabled source names.
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!settings) {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused().toLowerCase();
  const choices = settings
    .get()
    .statsSources.filter((s) => s.enabled && s.displayName.toLowerCase().includes(typed))
    .slice(0, 25)
    .map((s) => ({ name: s.displayName, value: s.id }));
  await interaction.respond(choices);
}

// Returns the configured roles the member holds as {label, emoji}, ignoring
// entries whose role no longer exists in the server.
function heldRoles(member: GuildMember | null, entries: RoleLabel[]): DisplayedRole[] {
  if (!member) {
    return [];
  }
  return entries
    .filter((entry) => member.roles.cache.has(entry.roleId))
    .map((entry) => ({ label: entry.label, emoji: entry.emoji }));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("user", true);
  const sourceId = interaction.options.getString("source") ?? undefined;

  // Public reply so everyone in the channel can see the info card.
  await interaction.deferReply();

  const lookup = await getAccountLookup()(user.id);
  if (!lookup.ok) {
    const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
    await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
    return;
  }
  const account = lookup.account;

  const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
  const stored = settings?.get();
  const regiments = heldRoles(member, stored?.regiments ?? []);
  const specialAssignments = heldRoles(member, stored?.specialAssignments ?? []);
  const imperialHonours = heldRoles(member, stored?.imperialHonours ?? []);

  const [ranks, headshot, search] = await Promise.all([
    getGroupRankLines(account.userId),
    getHeadshot(account.userId),
    getStatsService().findPlayerStats(account, sourceId),
  ]);

  // One table per source the player was found in.
  const tables: UserInfoTable[] = search.results.map((result) => ({
    sourceName: result.source.displayName,
    table: renderStatTable(buildStatCells(result.source.fields, result.row)),
    matchedNote: result.matchedByOldName ? `matched name: ${result.matchedUsername}` : null,
  }));

  const card = buildUserInfoCard({
    username: account.username,
    profileUrl: account.profileUrl,
    headshotUrl: headshot,
    ranks,
    regiments,
    specialAssignments,
    imperialHonours,
    tables,
  });

  const embeds = [card];

  // If nothing was found, note which sources were searched.
  if (tables.length === 0) {
    const searchedNames = (stored?.statsSources ?? [])
      .filter((s) => s.enabled && (!sourceId || s.id === sourceId))
      .map((s) => s.displayName);
    const note =
      searchedNames.length > 0
        ? `No stats found. Searched: ${searchedNames.join(", ")}.`
        : "No enabled stats sources to search.";
    embeds.push(warnEmbed("No stats", note));
  }

  // Name any failing sources.
  if (search.failures.length > 0) {
    const failed = search.failures.map((f) => `${f.sourceName}: ${f.error}`).join("\n");
    embeds.push(warnEmbed("Some sources failed", failed));
  }

  await interaction.editReply({ embeds });
}
