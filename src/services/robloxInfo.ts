// services/robloxInfo.ts
// Gathers the data shown by /whois and the "Roblox Info" context menu: the
// player's rank name in each managed group and their headshot URL.
import { MANAGED_GROUPS } from "../config/constants";
import { getRankNameInGroup, getHeadshotUrl } from "../api/roblox";
import type { GroupRankLine } from "../ui/embeds";

// Fetches the player's rank name in every managed group (label + rank name).
export async function getGroupRankLines(robloxUserId: number): Promise<GroupRankLine[]> {
  const lines: GroupRankLine[] = [];
  for (const group of MANAGED_GROUPS) {
    const rankName = await getRankNameInGroup(group.id, robloxUserId);
    lines.push({ label: group.label, rankName });
  }
  return lines;
}

// Fetches the headshot URL for a player (null if unavailable).
export async function getHeadshot(robloxUserId: number): Promise<string | null> {
  return getHeadshotUrl(robloxUserId);
}
