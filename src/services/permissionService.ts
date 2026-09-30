// services/permissionService.ts
// Decides who may run each command and lets admins change the allowed roles.
// The core decision is a pure function so it is easy to test; the rest reads
// and writes the settings store.
import type { GuildMember, PermissionsBitField } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { AccessLevel } from "../commands/types";
import type { SettingsStore } from "../storage/settingsStore";
import { commands } from "../commands/index";

// Inputs for the pure permission decision.
export type PermissionInput = {
  access: AccessLevel;
  allowedRoleIds: string[];
  memberRoleIds: string[];
  isAdmin: boolean;
  guildId: string;
};

// The pure rule. Order matters:
// 1) public is always allowed.
// 2) Administrators may run any configurable command.
// 3) admin-level commands are denied to non-admins.
// 4) configurable: allowed if the member has an allowed role, or the list
//    contains the guild ID (the @everyone role ID equals the guild ID).
export function isAllowed(input: PermissionInput): boolean {
  if (input.access === "public") {
    return true;
  }
  if (input.isAdmin) {
    return true;
  }
  if (input.access === "admin") {
    return false;
  }
  // configurable
  if (input.allowedRoleIds.includes(input.guildId)) {
    return true; // @everyone
  }
  return input.allowedRoleIds.some((roleId) => input.memberRoleIds.includes(roleId));
}

// True when the member has the Discord Administrator permission.
function memberIsAdmin(permissions: Readonly<PermissionsBitField>): boolean {
  return permissions.has(PermissionFlagsBits.Administrator);
}

// The command names that are configurable, taken from the registry.
function configurableCommandNames(): string[] {
  return Object.entries(commands)
    .filter(([, command]) => command.access === "configurable")
    .map(([name]) => name);
}

// Throws if the command is not a known configurable command.
function assertConfigurable(commandName: string): void {
  if (!configurableCommandNames().includes(commandName)) {
    throw new Error(`"${commandName}" is not a configurable command.`);
  }
}

// The permission service surface used by the router and /permissions command.
export type PermissionService = {
  canUseCommand(command: { name: string; access: AccessLevel }, member: GuildMember): boolean;
  addRole(commandName: string, roleId: string): Promise<void>;
  removeRole(commandName: string, roleId: string): Promise<void>;
  listRoles(commandName: string): string[];
  resetCommand(commandName: string): Promise<void>;
  configurableCommands(): string[];
};

// Builds the permission service over a settings store.
export function createPermissionService(settings: SettingsStore): PermissionService {
  function canUseCommand(
    command: { name: string; access: AccessLevel },
    member: GuildMember,
  ): boolean {
    return isAllowed({
      access: command.access,
      allowedRoleIds: settings.get().commandRoles[command.name] ?? [],
      memberRoleIds: [...member.roles.cache.keys()],
      isAdmin: memberIsAdmin(member.permissions),
      guildId: member.guild.id,
    });
  }

  async function addRole(commandName: string, roleId: string): Promise<void> {
    assertConfigurable(commandName);
    await settings.update((draft) => {
      const list = draft.commandRoles[commandName] ?? [];
      if (!list.includes(roleId)) {
        list.push(roleId);
      }
      draft.commandRoles[commandName] = list;
    });
  }

  async function removeRole(commandName: string, roleId: string): Promise<void> {
    assertConfigurable(commandName);
    await settings.update((draft) => {
      const list = draft.commandRoles[commandName] ?? [];
      draft.commandRoles[commandName] = list.filter((id) => id !== roleId);
    });
  }

  function listRoles(commandName: string): string[] {
    assertConfigurable(commandName);
    return settings.get().commandRoles[commandName] ?? [];
  }

  async function resetCommand(commandName: string): Promise<void> {
    assertConfigurable(commandName);
    await settings.update((draft) => {
      delete draft.commandRoles[commandName];
    });
  }

  return {
    canUseCommand,
    addRole,
    removeRole,
    listRoles,
    resetCommand,
    configurableCommands: configurableCommandNames,
  };
}
