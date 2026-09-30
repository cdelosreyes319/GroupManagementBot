// ui/embeds.ts
// Shared embed builders so every reply has one consistent look (colour set,
// footer and success/warning/failure icons).
import { EmbedBuilder } from "discord.js";
import type { RobloxAccount } from "../services/robloxAccount";
import { truncate } from "../utils/text";

// One place for the bot's colour palette (decimal RGB values).
export const COLORS = {
  success: 0x2ecc71,
  warn: 0xf1c40f,
  error: 0xe74c3c,
  info: 0x3498db,
} as const;

const FOOTER_TEXT = "GroupManagementBot";

// Builds the base embed with the shared footer applied.
function baseEmbed(color: number): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setFooter({ text: FOOTER_TEXT });
}

// A green success embed with a check icon in the title.
export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.success).setTitle(`✅ ${title}`);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

// A yellow warning embed with a warning icon in the title.
export function warnEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.warn).setTitle(`⚠️ ${title}`);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

// A red error embed with a cross icon in the title.
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(COLORS.error).setTitle(`❌ ${title}`);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

// One answer's summary line for the attendance poll embed.
export type PollSummaryLines = {
  yes: string;
  maybe: string;
  no: string;
  noAnswer: number;
  dmFailed: number;
};

// Builds the attendance poll summary embed posted in the results channel.
export function buildPollSummaryEmbed(title: string, lines: PollSummaryLines): EmbedBuilder {
  return baseEmbed(COLORS.info)
    .setTitle(`Attendance: ${title}`)
    .addFields(
      { name: "✅ Attending", value: lines.yes || "0" },
      { name: "🤔 Maybe", value: lines.maybe || "0" },
      { name: "❌ Can't attend", value: lines.no || "0" },
      { name: "No answer", value: String(lines.noAnswer), inline: true },
      { name: "DM failed", value: String(lines.dmFailed), inline: true },
    );
}

// Builds the event-DM embed a recipient sees: title, message, and a footer
// naming the sending officer and server. Never creates mentions.
export function buildEventDmEmbed(
  title: string,
  message: string,
  officerName: string,
  serverName: string,
): EmbedBuilder {
  return baseEmbed(COLORS.info)
    .setTitle(title)
    .setDescription(message)
    .setFooter({ text: `Sent by ${officerName} from ${serverName}` });
}

// A group's rank name for a player, used to build the Roblox info embed.
export type GroupRankLine = { label: string; rankName: string };

// One source's table on the /userinfo card: the source's display name, the
// rendered two-line table, and an optional "matched by old name" note.
export type UserInfoTable = { sourceName: string; table: string; matchedNote: string | null };

// Builds the single /userinfo card: avatar thumbnail, a description listing the
// group ranks, special assignments and regiment(s), and one field per source
// table (bold source name + aligned two-line table). Matches the grid layout in
// the design: thumbnail + info list on top, tables stacked below.
export function buildUserInfoCard(input: {
  username: string;
  profileUrl: string;
  headshotUrl: string | null;
  ranks: GroupRankLine[];
  specialAssignments: string[];
  regiments: string[];
  tables: UserInfoTable[];
}): EmbedBuilder {
  const description = [
    ...input.ranks.map((r) => `**${r.label}:** ${r.rankName}`),
    `**Special assignments:** ${input.specialAssignments.length > 0 ? input.specialAssignments.join(", ") : "None"}`,
    `**Regiment(s):** ${input.regiments.length > 0 ? input.regiments.join(", ") : "None"}`,
  ].join("\n");

  const embed = baseEmbed(COLORS.info)
    .setTitle(input.username)
    .setURL(input.profileUrl)
    .setDescription(description);

  if (input.headshotUrl) {
    embed.setThumbnail(input.headshotUrl);
  }

  // At most 25 fields per embed; each table is one field.
  for (const t of input.tables.slice(0, 25)) {
    const name = t.matchedNote ? `${t.sourceName} · ${t.matchedNote}` : t.sourceName;
    embed.addFields({ name: truncate(name, 256), value: t.table || "—" });
  }
  return embed;
}

// Builds the shared "Roblox info" embed: username (linked), ID, headshot, and
// the player's rank name in each managed group. Used by /whois and the
// "Roblox Info" context menu so both look identical.
export function buildRobloxInfoEmbed(
  account: RobloxAccount,
  ranks: GroupRankLine[],
  headshotUrl: string | null,
): EmbedBuilder {
  const embed = baseEmbed(COLORS.info)
    .setTitle(account.username)
    .setURL(account.profileUrl)
    .addFields({ name: "Roblox ID", value: String(account.userId), inline: true });

  for (const rank of ranks) {
    embed.addFields({ name: rank.label, value: rank.rankName, inline: true });
  }

  if (headshotUrl) {
    embed.setThumbnail(headshotUrl);
  }
  return embed;
}
