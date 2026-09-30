// init.ts
// Environment facade: validates required env vars and re-exports the static
// group constants. Importing this module requires decrypted env, so tests that
// need no secrets should import from config/constants.ts instead.
import { MANAGED_GROUPS, DISCORD_SERVER_ID, getManagedGroup } from "./config/constants";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, ROBLOX_TOKEN, BLOXLINK_KEY } = process.env;

// DISCORD_CORPS_ID is the Discord server (guild) ID used for Bloxlink lookups
// and command deployment. The name is kept for backward compatibility (tests
// and deploy-commands rely on it); it is not a Roblox group ID.
const DISCORD_CORPS_ID = DISCORD_SERVER_ID;
const ROBLOX_MAIN_ID = String(getManagedGroup("main").id);
const ROBLOX_CORPS_ID = String(getManagedGroup("corps").id);

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !ROBLOX_TOKEN || !BLOXLINK_KEY) {
  throw new Error("Missing environment variables");
}

export const env = {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  ROBLOX_TOKEN,
  BLOXLINK_KEY,
};

export const groups = {
  ROBLOX_CORPS_ID,
  DISCORD_CORPS_ID,
  ROBLOX_MAIN_ID,
};

export { MANAGED_GROUPS };

// Returns the Discord server ID (kept for backward compatibility with tests).
export function getCorpsID(): string {
  return DISCORD_CORPS_ID;
}
