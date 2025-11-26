//init.ts
import dotenv from "dotenv";
dotenv.config();
require('@dotenvx/dotenvx').config();

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, ROBLOX_TOKEN, BLOXLINK_KEY } = process.env;
const ROBLOX_CORPS_ID = "13206132";
const DISCORD_CORPS_ID = "1195572029412364408";
const ROBLOX_MAIN_ID = "5610765";

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !ROBLOX_TOKEN || !BLOXLINK_KEY) {
    throw new Error("Missing environment variables");
}

export const env = {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  ROBLOX_TOKEN,
  BLOXLINK_KEY
};

export const groups = {
  ROBLOX_CORPS_ID,
  DISCORD_CORPS_ID,
  ROBLOX_MAIN_ID
}
