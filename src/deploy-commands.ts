import { REST, Routes } from "discord.js";
import { env } from "./init";
import { commands } from "./commands/index";

const commandsData = Object.values(commands).map((command) => command.data);

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

export async function clearGlobalCommands() {
  try {
    console.log("Clearing global commands...");

    const globalCommands = await rest.put(
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

export function executeCommand(interaction : any) {
  const { commandName } = interaction;
  if (commands[commandName as keyof typeof commands]) {
    commands[commandName as keyof typeof commands].execute(interaction);
  }
}
