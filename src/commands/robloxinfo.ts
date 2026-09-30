// "Roblox Info" (user context menu)
// Arguments: the right-clicked member
// Access: configurable
// What it does: shows the same info as /whois for the selected member.
import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  type UserContextMenuCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import { getAccountLookup } from "../services/accountLookup";
import { getGroupRankLines, getHeadshot } from "../services/robloxInfo";
import { buildRobloxInfoEmbed, warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";

export const access: AccessLevel = "configurable";

export const data = new ContextMenuCommandBuilder()
  .setName("Roblox Info")
  .setType(ApplicationCommandType.User)
  .setDMPermission(false);

export async function execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
  // Public reply so everyone in the channel can see the info.
  await interaction.deferReply();

  const lookup = await getAccountLookup()(interaction.targetUser.id);
  if (!lookup.ok) {
    const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
    await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
    return;
  }

  const account = lookup.account;
  const [ranks, headshot] = await Promise.all([
    getGroupRankLines(account.userId),
    getHeadshot(account.userId),
  ]);
  await interaction.editReply({ embeds: [buildRobloxInfoEmbed(account, ranks, headshot)] });
}
