import { Client } from "discord.js";
import { env } from "./init";
import { clearGlobalCommands, deployCommands, executeCommand, getCommands } from "./deploy-commands";

// Giving bot permissions
const client = new Client({
  intents: ["Guilds", "GuildMessages", "DirectMessages", "GuildMembers", "GuildWebhooks","GuildPresences"],
});

client.once("clientReady", async () => {
  //Add commands for servers bot is already in
  //for (const [id, guild] of client.guilds.cache) {
  //  await deployCommands({guildId: guild.id});
  //}
  console.log("Discord bot is ready! 🤖");
});

client.on("guildCreate", async (guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }
  executeCommand(interaction);
});

client.login(env.DISCORD_TOKEN);

