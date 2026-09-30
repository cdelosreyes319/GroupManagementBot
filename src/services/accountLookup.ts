// services/accountLookup.ts
// Builds the shared Roblox account lookup from environment config and the API
// wrappers, and exposes it to commands through a single configured instance.
import { fetchRobloxIdForDiscordUser } from "../api/bloxlink";
import { getUsername } from "../api/roblox";
import { createRobloxAccountLookup, type LookupResult } from "./robloxAccount";

// The function commands use to resolve a Discord user to a Roblox account.
export type FindRobloxAccount = (discordUserId: string) => Promise<LookupResult>;

// Configuration needed to build the lookup (from env/init).
export type AccountLookupConfig = { guildId: string; bloxlinkKey: string };

let configured: FindRobloxAccount | null = null;

// Builds and stores the shared lookup (called once at startup).
export function configureAccountLookup(config: AccountLookupConfig): FindRobloxAccount {
  const { findRobloxAccount } = createRobloxAccountLookup({
    fetchRobloxId: (discordId) =>
      fetchRobloxIdForDiscordUser(discordId, {
        guildId: config.guildId,
        apiKey: config.bloxlinkKey,
      }),
    getUsername,
  });
  configured = findRobloxAccount;
  return findRobloxAccount;
}

// Returns the shared lookup, throwing if it was never configured.
export function getAccountLookup(): FindRobloxAccount {
  if (!configured) {
    throw new Error("Account lookup used before it was configured.");
  }
  return configured;
}
