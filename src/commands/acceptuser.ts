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
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { groups, env } from "../init";
import * as noblox from "noblox.js";
// hi
export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("Check & automatically accept user into corps & main groups.")
  .addUserOption((option) => option.setName('user').setDescription('Username of individual.').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser('user');
    if (user == null)
        return interaction.reply({content: 'User not found!', flags: MessageFlags.Ephemeral})

    await interaction.deferReply({flags: MessageFlags.Ephemeral});
    const ROBLOX_MAIN_ID = parseInt(groups.ROBLOX_MAIN_ID);
    const ROBLOX_CORPS_ID = parseInt(groups.ROBLOX_CORPS_ID);
    try {
      const response = await fetch(`https://api.blox.link/v4/public/guilds/${groups.DISCORD_CORPS_ID}/discord-to-roblox/${user.id}`, { headers: { "Authorization": env.BLOXLINK_KEY.toString() } });
      const responseJSON = await response.json();
      if (response.ok && !responseJSON.error) {
        const robloxID = responseJSON?.robloxID;
        
        if (!robloxID)
          return interaction.editReply({content: '❌Unexpected error happened! (RobloxID not found.)'});
        if (await noblox.getRankInGroup(ROBLOX_MAIN_ID, robloxID) == 0) {
          if (await noblox.getJoinRequest(ROBLOX_MAIN_ID, robloxID)) { 
            await noblox.handleJoinRequest(ROBLOX_MAIN_ID, robloxID, true);
            var msg = await interaction.fetchReply();
            interaction.editReply({content: msg.content + `\n✅<@!${user.id}> has been accepted to the main group!`});
          }
          else {
            var msg = await interaction.fetchReply();
            interaction.editReply({content: msg.content + `\n❌<@!${user.id}> has not sent a join request to the main group!`});
          }
        } else {
            var msg = await interaction.fetchReply();
            interaction.editReply({content: msg.content + `\n✅<@!${user.id}> is already in main group!`});
        }
        if (await noblox.getRankInGroup(ROBLOX_CORPS_ID, robloxID) == 0) {
          if (await noblox.getJoinRequest(ROBLOX_CORPS_ID, robloxID)) { 
            await noblox.handleJoinRequest(ROBLOX_CORPS_ID, robloxID, true); 
            var msg = await interaction.fetchReply();
            interaction.editReply({content: msg.content + `\n✅<@!${user.id}> has been accepted to the corps!`});
          }
          else {
            var msg = await interaction.fetchReply();
            interaction.editReply({content: msg.content + `\n❌<@!${user.id}> has not sent a join request to the corps!`});
          }
        } else {
            var msg = await interaction.fetchReply();
            interaction.editReply({content: msg.content + `\n✅<@!${user.id}> is already in corps!`});
        }
      }
      else {
        throw new Error(responseJSON.error);
      }
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: 'Unexpected error happened! (Check console for info.)'});
    }
}