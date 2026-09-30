// /whois
// Arguments: user (Discord user) OR roblox-username (string) — supply one
// Access: configurable
// What it does: shows a Roblox player's username, ID, profile link, headshot,
// and rank name in each managed group.
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { RobloxAccount } from "../services/robloxAccount";
import { getAccountLookup } from "../services/accountLookup";
import { getGroupRankLines, getHeadshot } from "../services/robloxInfo";
import { getIdFromUsername, getUsername } from "../api/roblox";
import { buildRobloxInfoEmbed, warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";

export const access: AccessLevel = "configurable";

export const data = new SlashCommandBuilder()
  .setName("whois")
  .setDescription("Show a Roblox player's info and ranks in the managed groups.")
  .setDMPermission(false)
  .addUserOption((o) => o.setName("user").setDescription("A Discord user to look up."))
  .addStringOption((o) =>
    o.setName("roblox-username").setDescription("A Roblox username to look up."),
  );

// Builds a RobloxAccount from a raw Roblox username, or null if not found.
async function accountFromUsername(username: string): Promise<RobloxAccount | null> {
  try {
    const userId = await getIdFromUsername(username);
    if (!userId) {
      return null;
    }
    const currentName = await getUsername(userId);
    return {
      userId,
      username: currentName,
      profileUrl: `https://www.roblox.com/users/${userId}/profile`,
    };
  } catch {
    return null;
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("user");
  const robloxUsername = interaction.options.getString("roblox-username");

  if (!user && !robloxUsername) {
    await interaction.reply({
      embeds: [warnEmbed("Missing input", "Provide either a Discord user or a Roblox username.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let account: RobloxAccount | null = null;
  if (user) {
    const lookup = await getAccountLookup()(user.id);
    if (!lookup.ok) {
      const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
      await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
      return;
    }
    account = lookup.account;
  } else if (robloxUsername) {
    account = await accountFromUsername(robloxUsername);
    if (!account) {
      await interaction.editReply({
        embeds: [warnEmbed("Not found", `No Roblox user named "${robloxUsername}" was found.`)],
      });
      return;
    }
  }

  if (!account) {
    return;
  }

  const [ranks, headshot] = await Promise.all([
    getGroupRankLines(account.userId),
    getHeadshot(account.userId),
  ]);
  await interaction.editReply({ embeds: [buildRobloxInfoEmbed(account, ranks, headshot)] });
}
