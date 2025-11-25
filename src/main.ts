import { Client } from "discord.js";
import { env } from "./init";
import { deployCommands, executeCommand } from "./commands/deploy";

// Giving bot permissions
const client = new Client({
  intents: ["Guilds", "GuildMessages", "DirectMessages", "GuildMembers", "GuildWebhooks","GuildPresences"],
});

client.once("clientReady", async () => {
  //Add commands for servers bot is already in
  await deployCommands();
  console.log("Discord bot is ready! 🤖");
});

client.on("guildCreate", async (guild) => {
  await deployCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }
  executeCommand(interaction);
});

client.login(env.DISCORD_TOKEN);

