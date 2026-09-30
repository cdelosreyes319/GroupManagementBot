// api/roblox.ts
// Thin wrappers over noblox.js so services never import noblox directly. This
// keeps external calls in one place and makes them easy to fake in tests.
import * as noblox from "noblox.js";
import { LIMITS } from "../config/constants";

// A group role as the bot cares about it: display name and its rank number.
export type GroupRole = { id: number; name: string; rank: number };

// The bot's own Roblox user ID, captured at login so rank checks can compare
// against the bot's rank. Set once from main.ts after noblox.setCookie.
let botUserId = 0;

// Records the bot's Roblox user ID (called once at startup).
export function setBotUserId(userId: number): void {
  botUserId = userId;
}

// Returns the bot's Roblox user ID (0 before login).
export function getBotUserId(): number {
  return botUserId;
}

// Returns the user's rank number in a group (0 means not a member).
export async function getRankInGroup(groupId: number, userId: number): Promise<number> {
  return noblox.getRankInGroup(groupId, userId);
}

// Returns the user's rank name in a group ("Guest" when not a member).
export async function getRankNameInGroup(groupId: number, userId: number): Promise<string> {
  return noblox.getRankNameInGroup(groupId, userId);
}

// Returns all roles of a group as { id, name, rank }.
export async function getGroupRoles(groupId: number): Promise<GroupRole[]> {
  const roles = await noblox.getRoles(groupId);
  return roles.map((role) => ({ id: role.id, name: role.name, rank: role.rank }));
}

// Sets a member's rank in a group by rank number.
export async function setRank(groupId: number, userId: number, rankNumber: number): Promise<void> {
  await noblox.setRank(groupId, userId, rankNumber);
}

// Returns true when the user has a pending join request in the group.
export async function hasJoinRequest(groupId: number, userId: number): Promise<boolean> {
  const request = await noblox.getJoinRequest(groupId, userId);
  return request != null;
}

// Accepts or declines a pending join request.
export async function handleJoinRequest(
  groupId: number,
  userId: number,
  accept: boolean,
): Promise<void> {
  await noblox.handleJoinRequest(groupId, userId, accept);
}

// Resolves a Roblox username to a user ID.
export async function getIdFromUsername(username: string): Promise<number> {
  return noblox.getIdFromUsername(username);
}

// Resolves a Roblox user ID to the current username.
export async function getUsername(userId: number): Promise<string> {
  return noblox.getUsernameFromId(userId);
}

// Returns previous usernames (most recent first), capped at `limit`.
// Returns [] on any failure so callers can still search current name + aliases.
// noblox's getUsernameHistory only accepts fixed page sizes (10/25/50/100), so
// we request the smallest page and slice down to the caller's limit.
export async function getPreviousUsernames(userId: number, limit: number): Promise<string[]> {
  try {
    const history = await noblox.getUsernameHistory(userId, 10, "Desc");
    return history.map((entry) => entry.name).slice(0, limit);
  } catch {
    console.error("Failed to fetch Roblox username history.");
    return [];
  }
}

// Returns a headshot image URL for the user, or null if unavailable.
export async function getHeadshotUrl(userId: number): Promise<string | null> {
  try {
    const thumbnails = await noblox.getPlayerThumbnail(userId, "150x150", "png", false, "headshot");
    return thumbnails[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

// The shared HTTP timeout used for any raw fetch fallbacks in this module.
export const ROBLOX_HTTP_TIMEOUT_MS = LIMITS.httpTimeoutMs;
