// commands/types.ts
// The shared command contract. Each command file exports `data`, `access`, and
// `execute`, plus an optional `autocomplete`.
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  UserContextMenuCommandInteraction,
} from "discord.js";

// Who may run a command:
// - public: anyone
// - configurable: only roles an admin allowed (fail-closed to admins otherwise)
// - admin: Discord Administrators only, never configurable
export type AccessLevel = "public" | "configurable" | "admin";

// A slash command. `data` is a SlashCommandBuilder (or subcommand builder).
export type BotCommand = {
  data: { name: string; toJSON(): unknown };
  access: AccessLevel;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
};

// A user context-menu command ("right-click a member" apps).
export type UserContextMenuCommand = {
  data: { name: string; toJSON(): unknown };
  access: AccessLevel;
  execute(interaction: UserContextMenuCommandInteraction): Promise<void>;
};
