import { Client } from "discord.js";
import { env } from "./init";
import { commands, contextmenus } from "./commands/index";
import { setCookie } from "noblox.js";

// Giving bot permissions
const client = new Client({
  intents: ["Guilds", "GuildMessages", "DirectMessages", "GuildMembers", "GuildWebhooks","GuildPresences"],
});

client.once("clientReady", async () => {
  //Add commands for servers bot is already in
  //for (const [id, guild] of client.guilds.cache) {
  //  await deployCommands({guildId: guild.id});
  //}
  const currentUser = await setCookie(env.ROBLOX_TOKEN);
  console.log(`Logged in as ${currentUser.name} [${currentUser.id}]`);
  console.log(`${client.user?.username} is ready!`);
});

client.on("guildCreate", async (guild) => {
  //await deployCommands({ guildId: guild.id });
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    if (commands[commandName as keyof typeof commands]) {
      commands[commandName as keyof typeof commands].execute(interaction);
    }
  }
  else if (interaction.isContextMenuCommand()) {
    const { commandName } = interaction;
    if (contextmenus[commandName as keyof typeof contextmenus]) {
      contextmenus[commandName as keyof typeof contextmenus].execute(interaction);
    }
  }
});

client.login(env.DISCORD_TOKEN);

