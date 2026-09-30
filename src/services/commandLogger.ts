// services/commandLogger.ts
// Formats and posts a log entry for every command run to a configured channel.
// The summary builder is pure (tested); the poster is fire-and-forget: it never
// mentions, never throws, and skips silently when no channel is set or the
// channel is unreachable. True secrets are never included.
import {
  ChannelType,
  type Client,
  type TextChannel,
} from "discord.js";
import type { SettingsStore } from "../storage/settingsStore";
import { successEmbed, errorEmbed } from "../ui/embeds";
import { truncate } from "../utils/text";

// A logged command entry. `detail` lines carry the specific, non-secret record
// of what was done (e.g. the eventdm title/message, or a rank outcome).
export type LogEntry = {
  commandName: string;
  runnerId: string;
  channelId: string;
  detail: string[];
  now?: number;
};

// Builds the multi-line log summary text for an entry (pure).
export function buildLogSummary(entry: LogEntry): string {
  const when = new Date(entry.now ?? Date.now()).toISOString();
  const lines = [
    `**/${entry.commandName}**`,
    `By: <@${entry.runnerId}>`,
    `In: <#${entry.channelId}>`,
    `At: ${when}`,
  ];
  for (const line of entry.detail) {
    lines.push(line);
  }
  // Keep within a Discord embed description limit.
  return truncate(lines.join("\n"), 4000);
}

// Formats one command option as a "name: value" detail line. Callers pass only
// non-secret options; this helper does not receive secrets.
export function optionLine(name: string, value: string): string {
  return `${name}: ${truncate(value, 500)}`;
}

// The logger surface used by the router and the eventdm confirm handler.
export type CommandLogger = {
  log(entry: LogEntry): void;
  // Posts a security alert that DOES ping @everyone. This is the single,
  // deliberate exception to the bot's no-mentions rule, reserved for events
  // like an auto-blacklist trip. Only ever fires in the log channel.
  alert(text: string): void;
};

// Builds the command logger over the Discord client and settings store.
export function createCommandLogger(client: Client, settings: SettingsStore): CommandLogger {
  // Posts the entry to the configured channel. Fire-and-forget: any failure is
  // caught and logged to the console; it never affects the command.
  function log(entry: LogEntry): void {
    const channelId = settings.get().logChannelId;
    if (!channelId) {
      return;
    }
    void post(channelId, entry).catch(() => {
      console.warn("Command log post failed; the log channel may be missing or unwritable.");
    });
  }

  // Resolves the channel and posts the embed (no mentions).
  async function post(channelId: string, entry: LogEntry): Promise<void> {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return;
    }
    await (channel as TextChannel).send({
      embeds: [successEmbed("Command run", buildLogSummary(entry))],
      allowedMentions: { parse: [] },
    });
  }

  // Posts a security alert to the log channel WITH an @everyone ping. This is
  // the only place the bot is allowed to mention @everyone. Fire-and-forget.
  function alert(text: string): void {
    const channelId = settings.get().logChannelId;
    if (!channelId) {
      return;
    }
    void postAlert(channelId, text).catch(() => {
      console.warn("Command alert post failed; the log channel may be missing or unwritable.");
    });
  }

  // Resolves the channel and posts the alert embed with an @everyone mention.
  async function postAlert(channelId: string, text: string): Promise<void> {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return;
    }
    await (channel as TextChannel).send({
      content: "@everyone",
      embeds: [errorEmbed("Security alert", truncate(text, 4000))],
      allowedMentions: { parse: ["everyone"] },
    });
  }

  return { log, alert };
}
