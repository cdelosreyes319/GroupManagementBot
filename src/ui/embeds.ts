// ui/embeds.ts
// Shared embed builders so every reply has one consistent look (colour set,
// footer and success/warning/failure icons).
import { EmbedBuilder } from "discord.js";
import type { RobloxAccount } from "../services/robloxAccount";
import { truncate } from "../utils/text";
import {
  THEME_COLORS,
  THEME_ICONS,
  POLL_ICONS,
  USERINFO_SECTION_EMOJIS,
} from "../config/theme";

const FOOTER_TEXT = "GroupManagementBot";

// Builds the base embed with the shared footer applied.
function baseEmbed(color: number): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setFooter({ text: FOOTER_TEXT });
}

// A green success embed with a check icon in the title.
export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(THEME_COLORS.success).setTitle(`${THEME_ICONS.success} ${title}`);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

// A yellow warning embed with a warning icon in the title.
export function warnEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(THEME_COLORS.warn).setTitle(`${THEME_ICONS.warn} ${title}`);
  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

// A red error embed with a cross icon in the title.
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = baseEmbed(THEME_COLORS.error).setTitle(`${THEME_ICONS.error} ${title}`);
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
  return baseEmbed(THEME_COLORS.pollSummary)
    .setTitle(`Attendance: ${title}`)
    .addFields(
      { name: `${POLL_ICONS.yes} Attending`, value: lines.yes || "0" },
      { name: `${POLL_ICONS.maybe} Maybe`, value: lines.maybe || "0" },
      { name: `${POLL_ICONS.no} Can't attend`, value: lines.no || "0" },
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
  return baseEmbed(THEME_COLORS.eventDm)
    .setTitle(title)
    .setDescription(message)
    .setFooter({ text: `Sent by ${officerName} from ${serverName}` });
}

// A group's rank name for a player, used to build the Roblox info embed.
export type GroupRankLine = { label: string; rankName: string };

// One source's table on the /userinfo card: the source's display name, the
// rendered two-line table, and an optional "matched by old name" note.
export type UserInfoTable = { sourceName: string; table: string; matchedNote: string | null };

// One displayed role on the /userinfo card: a label and an optional emoji.
export type DisplayedRole = { label: string; emoji: string | null };

// Prefixes a heading with a themed section emoji when one is configured.
function heading(sectionEmoji: string, text: string): string {
  return sectionEmoji ? `${sectionEmoji} **${text}:**` : `**${text}:**`;
}

// Renders a section as bullet points, one per role, with the entry's emoji
// prefixed when set. Shows "None" when the member holds no roles in the section.
function bulletSection(sectionEmoji: string, text: string, roles: DisplayedRole[]): string {
  if (roles.length === 0) {
    return `${heading(sectionEmoji, text)} None`;
  }
  const items = roles
    .map((r) => (r.emoji ? `- ${r.emoji} ${r.label}` : `- ${r.label}`))
    .join("\n");
  return `${heading(sectionEmoji, text)}\n${items}`;
}

// Builds the single /userinfo card: avatar thumbnail, a description listing the
// group ranks then regiments, special assignments and imperial honours (each as
// a bulleted list), and one field per source table. Matches the grid layout in
// the design: thumbnail + info list on top, tables stacked below.
export function buildUserInfoCard(input: {
  username: string;
  profileUrl: string;
  headshotUrl: string | null;
  ranks: GroupRankLine[];
  regiments: DisplayedRole[];
  specialAssignments: DisplayedRole[];
  imperialHonours: DisplayedRole[];
  tables: UserInfoTable[];
}): EmbedBuilder {
  // Rank lines: the first is Empire Français, the second Neuvième Corps (the
  // fixed MANAGED_GROUPS order), so their section emojis map by index.
  const rankEmojis = [
    USERINFO_SECTION_EMOJIS.empireFrancaisRank,
    USERINFO_SECTION_EMOJIS.neuviemeCorpsRank,
  ];
  const rankLines = input.ranks.map((r, i) => {
    const emoji = rankEmojis[i] ? `${rankEmojis[i]} ` : "";
    return `${emoji}**${r.label}:** ${r.rankName}`;
  });

  const description = [
    ...rankLines,
    bulletSection(USERINFO_SECTION_EMOJIS.regiments, "Regiment(s)", input.regiments),
    bulletSection(USERINFO_SECTION_EMOJIS.specialAssignments, "Special assignments", input.specialAssignments),
    bulletSection(USERINFO_SECTION_EMOJIS.imperialHonours, "Imperial Honours", input.imperialHonours),
  ].join("\n");

  const embed = baseEmbed(THEME_COLORS.userInfo)
    .setTitle(input.username)
    .setURL(input.profileUrl)
    .setDescription(truncate(description, 4096));

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
  const embed = baseEmbed(THEME_COLORS.userInfo)
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
