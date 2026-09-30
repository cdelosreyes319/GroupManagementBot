// services/commandLoggerInstance.ts
// Exposes a single shared command logger, wired to the Discord client and the
// settings store.
import type { Client } from "discord.js";
import type { SettingsStore } from "../storage/settingsStore";
import { createCommandLogger, type CommandLogger } from "./commandLogger";

let instance: CommandLogger | null = null;

// Builds and stores the shared command logger (called once at startup).
export function configureCommandLogger(client: Client, settings: SettingsStore): CommandLogger {
  instance = createCommandLogger(client, settings);
  return instance;
}

// Returns the shared command logger, or null if logging was never configured.
export function getCommandLogger(): CommandLogger | null {
  return instance;
}
