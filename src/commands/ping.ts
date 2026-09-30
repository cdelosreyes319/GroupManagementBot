// /ping
// Arguments: none
// Access: public
// What it does: replies with "Pong!" to confirm the bot is alive.
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { AccessLevel } from "./types";

export const access: AccessLevel = "public";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with Pong!")
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply("Pong!");
}
