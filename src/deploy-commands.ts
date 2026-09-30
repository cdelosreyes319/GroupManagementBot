import { REST, Routes } from "discord.js";
import { env, groups } from "./init";
import { commands, userContextMenus } from "./commands/index";
import { applyLocalizations } from "./i18n/applyLocalizations";
import type { LocalizationMap } from "discord.js";

// The structural shape applyLocalizations needs from a slash command builder.
type LocalizableCommandData = {
  setDescriptionLocalizations(map: LocalizationMap | null): unknown;
  toJSON(): unknown;
};

// Apply description localizations to each slash command by its registry name,
// then collect both slash and context-menu commands as JSON payloads. Context
// menu commands have no description, so they are not localized.
const commandsData = [
  ...Object.entries(commands).map(([name, command]) =>
    applyLocalizations(command.data as unknown as LocalizableCommandData, name).toJSON(),
  ),
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