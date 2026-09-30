// i18n/applyLocalizations.ts
// Applies the description localizations from localizations.ts to a slash command
// builder: the command's own description and each of its options' descriptions.
// Subcommands and subcommand groups are walked recursively so their options are
// localized too. English descriptions stay as set on the builder; this only adds
// translations, and Discord falls back to English where a translation is absent.
import type { LocalizationMap } from "discord.js";
import { commandDescriptionLocalizations, optionDescriptionLocalizations } from "./localizations";

// A minimal shape for an option builder that can carry localizations. Real
// discord.js option builders satisfy this; subcommand builders also have
// `options`.
type LocalizableOption = {
  name: string;
  setDescriptionLocalizations?: (map: LocalizationMap | null) => unknown;
  options?: LocalizableOption[];
};

// A command builder that can carry a description localization. All discord.js
// slash builder variants (full, options-only, subcommands-only) have this
// method, so the helper accepts any of them. The `options` array is read via an
// internal cast because discord.js types it more loosely than we need.
type LocalizableCommandBuilder = {
  setDescriptionLocalizations(map: LocalizationMap | null): unknown;
};

// Applies localizations to a command builder in place and returns it.
export function applyLocalizations<T extends LocalizableCommandBuilder>(
  builder: T,
  commandName: string,
): T {
  const commandMap = commandDescriptionLocalizations(commandName);
  if (commandMap) {
    builder.setDescriptionLocalizations(commandMap);
  }
  // `options` holds the builder's option/subcommand builders at runtime.
  const options = (builder as { options?: LocalizableOption[] }).options ?? [];
  for (const option of options) {
    localizeOption(option, commandName);
  }
  return builder;
}

// Recursively localizes an option (and any nested options under a subcommand or
// subcommand group).
function localizeOption(option: LocalizableOption, commandName: string): void {
  if (option.setDescriptionLocalizations) {
    const map = optionDescriptionLocalizations(commandName, option.name);
    if (map) {
      option.setDescriptionLocalizations(map);
    }
  }
  for (const child of option.options ?? []) {
    localizeOption(child, commandName);
  }
}
