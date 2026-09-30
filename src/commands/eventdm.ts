// /eventdm
// Arguments: role, limit (1–250, optional, default 250), results-channel (optional)
// Access: configurable
// What it does: opens a modal for a title and message, then previews an event
// DM to the most active members of a role before any DM is sent.
import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import { LIMITS } from "../config/constants";
import { getEventDmService } from "../services/eventDmInstance";
import { buildCustomId } from "../interactions/customId";
import { warnEmbed } from "../ui/embeds";

export const access: AccessLevel = "configurable";

export const data = new SlashCommandBuilder()
  .setName("eventdm")
  .setDescription("DM an event notice to the most active members of a role.")
  .setDMPermission(false)
  .addRoleOption((o) => o.setName("role").setDescription("The role to DM.").setRequired(true))
  .addIntegerOption((o) =>
    o
      .setName("limit")
      .setDescription("Maximum recipients (1–250, default 250).")
      .setMinValue(1)
      .setMaxValue(LIMITS.eventDmMaxRecipients),
  )
  .addChannelOption((o) =>
    o
      .setName("results-channel")
      .setDescription("Channel for an attendance poll summary (adds RSVP buttons to the DM).")
      .addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole("role", true);
  const limit = interaction.options.getInteger("limit") ?? LIMITS.eventDmMaxRecipients;
  const resultsChannel = interaction.options.getChannel("results-channel");

  // Validate the results channel before opening the modal.
  if (resultsChannel) {
    const channel = interaction.guild?.channels.cache.get(resultsChannel.id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [warnEmbed("Invalid channel", "The results channel must be a text channel in this server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const me = interaction.guild?.members.me;
    if (me && !channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
      await interaction.reply({
        embeds: [warnEmbed("Invalid channel", "I cannot send messages in that results channel.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const id = getEventDmService().createDraft({
    requesterId: interaction.user.id,
    guildId: interaction.guildId!,
    roleId: role.id,
    roleName: role.name,
    limit,
    resultsChannelId: resultsChannel?.id ?? null,
  });

  const modal = new ModalBuilder()
    .setCustomId(buildCustomId("eventdm", "modal", id))
    .setTitle("Event notice");

  const titleInput = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Title")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const messageInput = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("Message")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1500)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput),
  );

  await interaction.showModal(modal);
}
