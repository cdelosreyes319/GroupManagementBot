import { REST, Routes } from "discord.js";
import { env, groups } from "./init";
import { commands, userContextMenus } from "./commands/index";

// Collect both slash commands and context-menu commands as JSON payloads.
const commandsData = [
  ...Object.values(commands).map((command) => command.data.toJSON()),
  ...Object.values(userContextMenus).map((command) => command.data.toJSON()),
];

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

type DeployCommandsProps = {
  guildId: string;
};

export async function deployCommands({ guildId }: DeployCommandsProps) {
  try {
    console.log("Started refreshing application (/) commands.");
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId),
      {
        body: commandsData,
      }
    );

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

export async function getCommands() {
  try {
    console.log("Fetching commands");

    const globalCommands = await rest.get(
      Routes.applicationCommands(env.DISCORD_CLIENT_ID)
    );
    console.log(globalCommands);
  } catch (error) {
    console.error(error);
  }
}

export async function getGuildCommands({ guildId }: DeployCommandsProps) {
  try {
    console.log("Fetching commands");

    const guildCommands = await rest.get(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId)
    );
    console.log(guildCommands);
  } catch (error) {
    console.error(error);
  }
}

export async function clearGlobalCommands() {
  try {
    console.log("Clearing global commands...");

    await rest.put(
      Routes.applicationCommands(env.DISCORD_CLIENT_ID),
      {
        body: []
      }
    );
    console.log("Successfully cleared application global commands.");
  } catch (error) {
    console.error(error);
  }
}

(async () => {
  await deployCommands({guildId: groups.DISCORD_CORPS_ID});
  //await getGuildCommands({guildId: groups.DISCORD_CORPS_ID.toString()});
  //await getCommands();
})()