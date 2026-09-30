// config/constants.ts
// Static configuration with no environment access, so tests can import it freely.
// Holds the managed Roblox groups, the Discord server ID, and the tunable LIMITS.

// The two Roblox groups this bot manages. No other group may ever be acted on.
// The `key` (not the raw ID) is what slash-command choices use as their value.
export const MANAGED_GROUPS = [
  { key: "main", label: "Empire Français", id: 5610765 },
  { key: "corps", label: "Neuvième Corps", id: 13206132 },
] as const;

export type GroupKey = (typeof MANAGED_GROUPS)[number]["key"];

// The Discord server (guild) the bot serves. Used for Bloxlink lookups and
// command deployment. Historically named DISCORD_CORPS_ID; it is a Discord ID,
// not a Roblox group ID.
export const DISCORD_SERVER_ID = "1195572029412364408";

// Returns the managed group for a key, throwing on an unknown key.
export function getManagedGroup(key: GroupKey): (typeof MANAGED_GROUPS)[number] {
  const group = MANAGED_GROUPS.find((g) => g.key === key);
  if (!group) {
    throw new Error(`Unknown managed group key: ${key}`);
  }
  return group;
}

// Central tuning values: timeouts, cache sizes/TTLs, and feature limits.
export const LIMITS = {
  httpTimeoutMs: 8000,

  robloxIdCacheMax: 200,
  robloxIdCacheTtlMs: 5 * 60_000,

  groupRolesCacheTtlMs: 5 * 60_000,

  statsCacheMax: 100,
  statsCacheTtlMs: 60_000,

  maxStatsSourcesAtOnce: 3,
  maxAliasesPerPlayer: 10,
  maxOldUsernames: 10,

  eventDmMaxRecipients: 1000,
  eventDmDelayMs: 1200,
  eventDmCooldownMs: 5 * 60_000,
  eventDmPreviewTtlMs: 5 * 60_000,
  eventDmProgressEvery: 10,
  // Rate limit: at most this many confirmed sends per user within the rolling
  // window. Exceeding it auto-blacklists the user from /eventdm.
  eventDmMaxPerDay: 5,
  eventDmRateWindowMs: 24 * 60 * 60_000,

  pollOpenMs: 72 * 60 * 60_000,
  pollSummaryEditGapMs: 10_000,
  pollMaxStored: 20,
  pollMaxAgeMs: 30 * 24 * 60 * 60_000,
  pollNamesPerAnswer: 20,

  activityFlushGapMs: 5 * 60_000,
  activityMaxEntries: 5000,
  activityMaxAgeMs: 90 * 24 * 60 * 60_000,
} as const;
