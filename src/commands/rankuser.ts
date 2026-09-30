// /rank
// Arguments: user (Discord user), group (empire-francais | neuvieme-corps),
//   rank (autocomplete of that group's rank names), sync-corps (optional, default on)
// Access: configurable
// What it does: sets a member's rank in one managed group; from Empire Français
// it also updates the Corps rank via the Rank Sync Table.
import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type GuildMember,
} from "discord.js";
import type { AccessLevel } from "./types";
import { MANAGED_GROUPS } from "../config/constants";
import { getAccountLookup } from "../services/accountLookup";
import { getRankService } from "../services/rankServiceInstance";
import type { CorpsSyncOutcome } from "../services/rankService";
import { computeRankRoleChange } from "../services/rankRoleService";
import { successEmbed, warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";

export const access: AccessLevel = "configurable";

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Set a member's rank in a managed group (Empire Français also syncs the Corps).")
  .setDMPermission(false)
  .addUserOption((o) => o.setName("user").setDescription("The member to rank.").setRequired(true))
  .addStringOption((o) =>
    o
      .setName("group")
      .setDescription("Which group to rank in.")
      .setRequired(true)
      .addChoices(...MANAGED_GROUPS.map((g) => ({ name: g.label, value: g.key }))),
  )
  .addStringOption((o) =>
    o
      .setName("rank")
      .setDescription("The rank to give (start typing to search).")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addBooleanOption((o) =>
    o
      .setName("sync-corps")
      .setDescription("Also update the Neuvième Corps rank (default: on). Empire Français only."),
  );

// Autocomplete: the chosen group's rank names, filtered by typed text, max 25.
// The choice VALUE is the rank number (as a string).
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const groupKey = interaction.options.getString("group");
  if (groupKey !== "main" && groupKey !== "corps") {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused().toLowerCase();
  try {
    const roles = await getRankService().getRolesForGroup(groupKey);
    const choices = roles
      .filter((role) => role.rank !== 0 && role.rank !== 255)
      .filter((role) => role.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((role) => ({ name: role.name, value: String(role.rank) }));
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

// The outcome of updating the member's Discord rank role.
type DiscordRoleOutcome =
  | { status: "not_applicable" } // rank change was not in Empire Français, or no change
  | { status: "no_role" } // the new EF rank has no mapped Discord role (manual ranks)
  | { status: "unchanged" } // the member already had exactly the right rank role
  | { status: "changed" } // the role was replaced
  | { status: "failed"; reason: string };

// Updates the member's Discord rank role: adds the new rank's role and removes
// any other managed rank role, touching no other roles. Done directly (not via
// Bloxlink) so it fires immediately. Never throws; returns an outcome.
async function syncDiscordRankRole(
  member: GuildMember | null,
  newEfRank: number,
): Promise<DiscordRoleOutcome> {
  if (!member) {
    return { status: "failed", reason: "the member is not in this Discord server" };
  }

  const change = computeRankRoleChange(newEfRank, [...member.roles.cache.keys()]);
  if (!change.add) {
    return { status: "no_role" };
  }
  if (member.roles.cache.has(change.add) && change.remove.length === 0) {
    return { status: "unchanged" };
  }

  // Check the bot can manage roles before attempting the edit.
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { status: "failed", reason: "the bot lacks the Manage Roles permission" };
  }

  try {
    if (change.remove.length > 0) {
      await member.roles.remove(change.remove, "rank sync");
    }
    await member.roles.add(change.add, "rank sync");
    return { status: "changed" };
  } catch {
    return {
      status: "failed",
      reason: "the role may be above the bot in the role list or no longer exist",
    };
  }
}

// Builds a one-line summary of the Discord rank-role outcome for the reply.
function discordRoleLine(outcome: DiscordRoleOutcome): string | null {
  switch (outcome.status) {
    case "not_applicable":
      return null;
    case "no_role":
      return "Discord role: not changed (this rank is assigned manually).";
    case "unchanged":
      return "Discord role: already correct, no change.";
    case "changed":
      return "Discord role: updated to match the new rank.";
    case "failed":
      return `Discord role update failed: ${outcome.reason} (Roblox rank change kept).`;
  }
}

// Builds a one-line summary of the Corps sync outcome for the reply.
function corpsLine(outcome: CorpsSyncOutcome): string {
  switch (outcome.status) {
    case "off":
      return "Corps sync: not applicable.";
    case "no_rule":
      return "Corps sync: no rule matches this Empire Français rank; Corps left unchanged.";
    case "not_member":
      return "Corps sync: skipped, the member is not in Neuvième Corps.";
    case "unchanged":
      return `Corps sync: already ${outcome.rankName}, no change.`;
    case "changed":
      return `Corps sync: ${outcome.oldRankName} → ${outcome.newRankName} in Neuvième Corps.`;
    case "failed":
      return `Corps sync failed: ${outcome.reason} (Empire Français change kept).`;
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("user", true);
  const groupKey = interaction.options.getString("group", true) as "main" | "corps";
  const rankValue = Number(interaction.options.getString("rank", true));
  const syncCorps = interaction.options.getBoolean("sync-corps") ?? true;

  if (Number.isNaN(rankValue)) {
    await interaction.reply({
      embeds: [warnEmbed("Invalid rank", "Pick a rank from the autocomplete list.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // An officer may not rank or derank themselves (no self-promotion).
  if (user.id === interaction.user.id) {
    await interaction.reply({
      embeds: [warnEmbed("Not allowed", "You cannot change your own rank. Ask another officer.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lookup = await getAccountLookup()(user.id);
  if (!lookup.ok) {
    const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
    await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
    return;
  }

  const account = lookup.account;
  const groupLabel = MANAGED_GROUPS.find((g) => g.key === groupKey)!.label;

  const result = await getRankService().setRankWithSync({
    robloxUserId: account.userId,
    groupKey,
    newRank: rankValue,
    syncCorps,
  });

  if ("refused" in result) {
    await interaction.editReply({ embeds: [warnEmbed("Rank not changed", result.refused)] });
    return;
  }

  const lines: string[] = [];
  if (result.main.changed) {
    lines.push(`${groupLabel}: ${result.main.oldRankName} → ${result.main.newRankName}.`);
  } else {
    lines.push(`${groupLabel}: already ${result.main.newRankName}, no change.`);
  }
  lines.push(corpsLine(result.corps));

  // Sync the Discord rank role only for an Empire Français change that happened.
  let discordOutcome: DiscordRoleOutcome = { status: "not_applicable" };
  if (groupKey === "main" && result.main.changed) {
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    discordOutcome = await syncDiscordRankRole(member, rankValue);
  }
  const roleLine = discordRoleLine(discordOutcome);
  if (roleLine) {
    lines.push(roleLine);
  }

  const embed = successEmbed(`Rank: ${account.username}`, lines.join("\n"))
    .setURL(account.profileUrl)
    .addFields({ name: "Actioned by", value: `<@${interaction.user.id}>`, inline: true });
  await interaction.editReply({ embeds: [embed] });

  // Console audit line (no secrets).
  console.log(
    `[rank] ${new Date().toISOString()} officer=${interaction.user.id} target=${account.userId} ${lines.join(" | ")}`,
  );
}
