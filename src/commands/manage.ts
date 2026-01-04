// manage.ts (Manage Command Group)

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { handleJoinRequest } from "noblox.js";
import { groups } from "../init";

export const data = new SlashCommandBuilder()
  .setName("manage")
  .setDescription("Manage user ranks, company (TBD) & medals (TBD).")
  .addSubcommandGroup((ranks) => 
    ranks
        .setName("ranks")
        .setDescription("Manage ranks of the user.")
        .addSubcommand((accept) =>
            accept
                .setName('accept')
                .setDescription("Accept user into groups.")
                .addUserOption((option) => option.setName('user').setDescription("target user"))
        )
        .addSubcommand((set) =>
            set
                .setName('set')
                .setDescription("Change rank of user in groups.")
                .addUserOption((option) => option.setName('user').setDescription("target user"))
        )
)

export async function execute(interaction: ChatInputCommandInteraction) {
    interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('user');
    if (!user) { return interaction.editReply("User not found!") }

    const result = handleJoinRequest(parseInt(groups.ROBLOX_MAIN_ID), 1223332, true);
    return interaction.editReply("End of manage.");
}