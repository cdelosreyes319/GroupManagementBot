// /accept
// Arguments: user (Discord user)
// Access: configurable
// What it does: accepts a member's pending join request into both managed
// Roblox groups, or reports their existing membership status. Sends one reply.
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { AccessLevel } from "./types";
import { MANAGED_GROUPS } from "../config/constants";
import { getAccountLookup } from "../services/accountLookup";
import { getRankInGroup, hasJoinRequest, handleJoinRequest } from "../api/roblox";
import { successEmbed, warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";

export const access: AccessLevel = "configurable";

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("Check & automatically accept a user into the corps & main groups.")
  .setDMPermission(false)
  .addUserOption((option) =>
    option.setName("user").setDescription("The Discord user to accept.").setRequired(true),
  );

// Processes one managed group and returns a single result line for the reply.
async function acceptIntoGroup(
  groupLabel: string,
  groupId: number,
  robloxUserId: number,
  displayName: string,
): Promise<string> {
  const rank = await getRankInGroup(groupId, robloxUserId);
  if (rank !== 0) {
    return `✅ ${displayName} is already in ${groupLabel}.`;
  }
  if (await hasJoinRequest(groupId, robloxUserId)) {
    await handleJoinRequest(groupId, robloxUserId, true);
    return `✅ ${displayName} has been accepted into ${groupLabel}.`;
  }
  return `❌ ${displayName} has no pending join request for ${groupLabel}.`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("user", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lookup = await getAccountLookup()(user.id);
  if (!lookup.ok) {
    const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
    await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
    return;
  }

  const account = lookup.account;
  const lines: string[] = [];
  try {
    for (const group of MANAGED_GROUPS) {
      lines.push(await acceptIntoGroup(group.label, group.id, account.userId, account.username));
    }
  } catch (error) {
    console.error("Accept command failed during a Roblox call:", errorMessage(error));
    await interaction.editReply({
      embeds: [warnEmbed("Roblox error", "A Roblox request failed. Some groups may be unchanged.")],
    });
    return;
  }

  const embed = successEmbed(`Accept: ${account.username}`, lines.join("\n"))
    .setURL(account.profileUrl)
    .addFields({ name: "Actioned by", value: `<@${interaction.user.id}>`, inline: true });
  await interaction.editReply({ embeds: [embed] });
}

// A short, secret-free error string for logging.
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
