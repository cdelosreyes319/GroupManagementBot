// services/robloxAccount.ts
// Resolves a Discord user to their Roblox account through Bloxlink, with a
// small bounded cache. Dependencies are injected so tests use fakes.
import { LIMITS } from "../config/constants";
import { TTLCache } from "../utils/ttlCache";
import type { BloxlinkResult } from "../api/bloxlink";

// A resolved Roblox account.
export type RobloxAccount = { userId: number; username: string; profileUrl: string };

// The result of looking up a Discord user's Roblox account.
export type LookupResult =
  | { ok: true; account: RobloxAccount }
  | { ok: false; reason: "not_linked" | "bloxlink_error" | "timeout" };

// The external calls the service depends on, injected for testability.
export type RobloxAccountDeps = {
  fetchRobloxId: (discordId: string) => Promise<BloxlinkResult>;
  getUsername: (userId: number) => Promise<string>;
};

// Builds a profile URL for a Roblox user ID.
function profileUrl(userId: number): string {
  return `https://www.roblox.com/users/${userId}/profile`;
}

// Creates a lookup function that caches results by Discord user ID.
// The cache holds at most 200 entries for 5 minutes (from LIMITS).
export function createRobloxAccountLookup(deps: RobloxAccountDeps) {
  const cache = new TTLCache<string, RobloxAccount>(
    LIMITS.robloxIdCacheMax,
    LIMITS.robloxIdCacheTtlMs,
  );

  // Resolves a Discord user ID to a Roblox account, using the cache when warm.
  async function findRobloxAccount(discordUserId: string): Promise<LookupResult> {
    const cached = cache.get(discordUserId);
    if (cached) {
      return { ok: true, account: cached };
    }

    const idResult = await deps.fetchRobloxId(discordUserId);
    if (!idResult.ok) {
      return { ok: false, reason: idResult.reason };
    }

    const username = await deps.getUsername(idResult.robloxId);
    const account: RobloxAccount = {
      userId: idResult.robloxId,
      username,
      profileUrl: profileUrl(idResult.robloxId),
    };
    cache.set(discordUserId, account);
    return { ok: true, account };
  }

  return { findRobloxAccount };
}
