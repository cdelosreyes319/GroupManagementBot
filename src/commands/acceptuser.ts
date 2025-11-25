// Accept User
// **********
// Arguments
// **********
// discordUser : Mention of user
// **********
// TODO
// 1. Parse mention into usable user data
// 2. Match user to bloxlink database
// 3. Accept user in both Neuvieme and Main groups if pending
// 4. Read back membership status of user in both groups
import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";
import { groups, env } from "../init"

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("Check & automatically accept user into corps & main groups.")
  .addUserOption((option) => option.setName('user').setDescription('Username of individual.').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user');
    if (user == null)
        return interaction.reply({ content: 'User not found!', flags: MessageFlags.Ephemeral })

    const response = await fetch(`https://api.blox.link/v4/public/guilds/${groups.DISCORD_CORPS_ID}/discord-to-roblox/${user.id}`, { headers: { "Authorization": "0e0bd54b-83a9-4d10-b126-89c7667677d8" } })
    console.log(response.json());
    return interaction.reply({ content: 'Secret Pong!', flags: MessageFlags.Ephemeral });
}