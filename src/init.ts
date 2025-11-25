import dotenv from "dotenv";
dotenv.config();
require('@dotenvx/dotenvx').config();

const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
    throw new Error("Missing environment variables");
}

export const env = {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
};


