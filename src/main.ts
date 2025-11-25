import { Client } from "discord.js";
import { config } from "./config.js";

const client = new Client({
  intents: ["Guilds", "GuildMessages", "DirectMessages"],
});

client.once("ready", () => {
  console.log("Discord bot is ready! 🤖");
});

client.login(config.DISCORD_TOKEN);

