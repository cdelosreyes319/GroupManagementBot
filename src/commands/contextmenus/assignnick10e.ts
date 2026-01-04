// Management Context Menu
// UserContextMenu
// *************************
// Arguments
// NIL
// **********************

import { ApplicationCommandType, ContextMenuCommandBuilder, ContextMenuCommandInteraction, MessageFlags } from "discord.js";


export const data = new ContextMenuCommandBuilder()
    .setName("Placeholder")
    .setType(ApplicationCommandType.User);

export async function execute(interaction: ContextMenuCommandInteraction) {
    return interaction.reply({ content: "Executed..NOT!", flags: MessageFlags.Ephemeral});
}