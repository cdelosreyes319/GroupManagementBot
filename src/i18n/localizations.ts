// i18n/localizations.ts
// Discord-native localizations for command and option DESCRIPTIONS. English is
// the default (set directly on each builder); this file supplies translations
// for other locales. A missing translation falls back to English automatically
// (Discord does this), so not every string must be translated.
//
// Seed locales: English (default) + Chinese Simplified ("zh-CN"). Adding another
// Discord-supported locale is a matter of adding its entries here — no logic
// changes. Command names, option names, modals, buttons, embed/reply content,
// and sheet data are NOT localized (Discord cannot localize the latter three,
// and localizing command names would change how members invoke them).
import type { LocalizationMap } from "discord.js";

// A description keyed by locale. Only non-English locales need entries.
type LocaleText = Partial<Record<keyof LocalizationMap, string>>;

// Chinese Simplified descriptions for each command, keyed by command name, then
// by option/subcommand key ("_" is the command's own description).
// Keep translations concise, matching the English descriptions.
const ZH_CN: Record<string, Record<string, string>> = {
  ping: { _: "回复 Pong，用于确认机器人在线。" },
  accept: {
    _: "将成员待处理的加入申请通过到两个管理的 Roblox 群组。",
    user: "要通过的 Discord 用户。",
  },
  whois: {
    _: "显示某玩家的 Roblox 信息以及在管理群组中的军衔。",
    user: "要查询的 Discord 用户。",
    "roblox-username": "要查询的 Roblox 用户名。",
  },
  rank: {
    _: "设置成员在某群组的军衔；从帝国自动同步军团军衔与 Discord 身份组。",
    user: "要设置军衔的成员。",
    group: "要设置军衔的群组。",
    rank: "要授予的军衔（输入以搜索）。",
    "sync-corps": "同时更新第九军团的军衔（默认开启，仅帝国适用）。",
  },
  eventdm: {
    _: "向某身份组中最活跃的成员发送活动私信，可附带出席投票。",
    role: "接收私信的身份组。",
    limit: "最大接收人数（1–250，默认 250）。",
    "results-channel": "出席投票汇总所发送的频道（会为私信添加 RSVP 按钮）。",
  },
  "eventdm-exclusions": {
    _: "管理永远不会收到活动私信的身份组。",
  },
  userinfo: {
    _: "显示玩家信息卡：军衔、团队、特别任命、帝国荣誉与数据。",
    user: "要查询的 Discord 用户。",
    source: "指定某个数据来源。",
  },
  "stats-source": {
    _: "管理 Google 表格数据来源及其显示字段。",
  },
  "stats-alias": {
    _: "管理某玩家的手动表格用户名别名。",
  },
  roles: {
    _: "管理 /userinfo 显示的团队、特别任命与帝国荣誉身份组。",
  },
  permissions: {
    _: "管理哪些身份组可以使用各个可配置命令。",
  },
  log: {
    _: "设置或查看记录命令执行的频道。",
  },
};

// Returns the localization map for a command's own description, or undefined
// when there is no translation (Discord then uses the English default).
export function commandDescriptionLocalizations(commandName: string): LocalizationMap | undefined {
  return buildMap(commandName, "_");
}

// Returns the localization map for an option's description, or undefined.
export function optionDescriptionLocalizations(
  commandName: string,
  optionName: string,
): LocalizationMap | undefined {
  return buildMap(commandName, optionName);
}

// Builds a LocalizationMap for one (command, key) across all non-English locales
// that have a translation. Returns undefined when none do.
function buildMap(commandName: string, key: string): LocalizationMap | undefined {
  const map: LocaleText = {};
  const zh = ZH_CN[commandName]?.[key];
  if (zh) {
    map["zh-CN"] = zh;
  }
  return Object.keys(map).length > 0 ? (map as LocalizationMap) : undefined;
}
