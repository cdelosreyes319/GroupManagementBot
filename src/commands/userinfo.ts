// /userinfo
// Arguments: user (Discord user), source (optional, autocomplete of source names)
// Access: configurable
// What it does: shows a player's stats card from one or all enabled sources,
// plus their rank in each managed group.
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import { getAccountLookup } from "../services/accountLookup";
import { getStatsService } from "../services/statsServiceInstance";
import { getGroupRankLines, getHeadshot } from "../services/robloxInfo";
import { buildEmbedFields } from "../services/statsFormatter";
import { buildStatsEmbed, warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";

export const access: AccessLevel = "configurable";

let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Show a player's stats card and group ranks.")
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("user", true);
  const sourceId = interaction.options.getString("source") ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lookup = await getAccountLookup()(user.id);
  if (!lookup.ok) {
    const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
    await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
    return;
  }
  const account = lookup.account;

  const [ranks, headshot, search] = await Promise.all([
    getGroupRankLines(account.userId),
    getHeadshot(account.userId),
    getStatsService().findPlayerStats(account, sourceId),
  ]);

  // Build up to 3 stats embeds, one per matching source.
  const embeds = search.results.slice(0, 3).map((result) =>
    buildStatsEmbed({
      username: account.username,
      profileUrl: account.profileUrl,
      headshotUrl: headshot,
      ranks,
      fields: buildEmbedFields(result.source.fields, result.row),
      sourceName: result.source.displayName,
      accentColor: result.source.accentColor,
      matchedByOldName: result.matchedByOldName ? result.matchedUsername : null,
    }),
  );

  if (embeds.length > 0) {
    // Note any failing sources alongside the results.
    if (search.failures.length > 0) {
      const failed = search.failures.map((f) => `${f.sourceName}: ${f.error}`).join("\n");
      embeds.push(warnEmbed("Some sources failed", failed));
    }
    await interaction.editReply({ embeds });
    return;
  }

  // Nothing found: still show group ranks and name which sources were searched.
  const searchedNames = settings
    ? settings
        .get()
        .statsSources.filter((s) => s.enabled && (!sourceId || s.id === sourceId))
        .map((s) => s.displayName)
    : [];
  const lines = [
    `Ranks — ${ranks.map((r) => `${r.label}: ${r.rankName}`).join(" · ")}`,
    searchedNames.length > 0 ? `Searched: ${searchedNames.join(", ")}` : "No enabled sources to search.",
  ];
  if (search.failures.length > 0) {
    lines.push(`Failures: ${search.failures.map((f) => `${f.sourceName} (${f.error})`).join(", ")}`);
  }
  await interaction.editReply({ embeds: [warnEmbed(`No stats found: ${account.username}`, lines.join("\n"))] });
}
