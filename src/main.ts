import { Client } from "discord.js";
import { env } from "./init";
import { commands } from "./commands/index"

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
  //await deployCommands({ guildId: guild.id });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }
  const { commandName } = interaction;
    if (commands[commandName as keyof typeof commands]) {
      commands[commandName as keyof typeof commands].execute(interaction);
    }
});

client.login(env.DISCORD_TOKEN);

