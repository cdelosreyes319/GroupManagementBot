// /log
// Arguments: subcommand set (channel) | show
// Access: admin
// What it does: sets or shows the channel where every command run is logged.
// The channel may be shared with other logging bots (e.g. Dyno); the bot only
// posts to it and never manages it.
import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import { successEmbed, warnEmbed } from "../ui/embeds";

export const access: AccessLevel = "admin";

let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

export const data = new SlashCommandBuilder()
  .setName("log")
  .setDescription("Set or show the channel where command runs are logged.")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Set the log channel.")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The text channel to log commands to.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName("show").setDescription("Show the current log channel."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "show") {
    const id = settings.get().logChannelId;
    const text = id ? `Logging to <#${id}>.` : "No log channel is set.";
    await interaction.reply({ embeds: [successEmbed("Command logging", text)], flags: MessageFlags.Ephemeral });
    return;
  }

  // set
  const channel = interaction.options.getChannel("channel", true);
  const resolved = interaction.guild?.channels.cache.get(channel.id);
  if (!resolved || resolved.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [warnEmbed("Invalid channel", "The log channel must be a text channel in this server.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const me = interaction.guild?.members.me;
  if (me && !resolved.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({
      embeds: [warnEmbed("Invalid channel", "I cannot send messages in that channel.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await settings.update((draft) => {
    draft.logChannelId = channel.id;
  });
  await interaction.reply({
    embeds: [successEmbed("Log channel set", `Command runs will be logged to <#${channel.id}>.`)],
    flags: MessageFlags.Ephemeral,
  });
}
