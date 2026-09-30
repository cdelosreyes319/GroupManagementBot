// /permissions
// Arguments: subcommand add|remove|list|reset, command (autocomplete), role (for add/remove)
// Access: admin (never configurable)
// What it does: shows or changes which roles may run each configurable command.
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { PermissionService } from "../services/permissionService";
import { successEmbed, warnEmbed } from "../ui/embeds";

export const access: AccessLevel = "admin";

export const data = new SlashCommandBuilder()
  .setName("permissions")
  .setDescription("Manage which roles may run configurable commands.")
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Allow a role to use a command.")
      .addStringOption((o) =>
        o.setName("command").setDescription("The command.").setRequired(true).setAutocomplete(true),
      )
      .addRoleOption((o) => o.setName("role").setDescription("The role to allow.").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Stop a role from using a command.")
      .addStringOption((o) =>
        o.setName("command").setDescription("The command.").setRequired(true).setAutocomplete(true),
      )
      .addRoleOption((o) => o.setName("role").setDescription("The role to remove.").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Show the roles allowed to use a command.")
      .addStringOption((o) =>
        o.setName("command").setDescription("The command.").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("reset")
      .setDescription("Clear all allowed roles for a command (fail-closed to admins).")
      .addStringOption((o) =>
        o.setName("command").setDescription("The command.").setRequired(true).setAutocomplete(true),
      ),
  );

// The permission service is injected once at wiring time.
let service: PermissionService | null = null;

// Wires the permission service into this command (called from main.ts).
export function configure(permissionService: PermissionService): void {
  service = permissionService;
}

// Autocomplete: only configurable command names, filtered by what was typed.
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!service) {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused().toLowerCase();
  const matches = service
    .configurableCommands()
    .filter((name) => name.includes(typed))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));
  await interaction.respond(matches);
}

// Formats a role ID list, marking IDs that no longer exist as "deleted role".
function formatRoles(interaction: ChatInputCommandInteraction, roleIds: string[]): string {
  if (roleIds.length === 0) {
    return "_No roles set (admins only)._";
  }
  return roleIds
    .map((id) => {
      const role = interaction.guild?.roles.cache.get(id);
      return role ? `<@&${id}>` : `\`${id}\` (deleted role)`;
    })
    .join(", ");
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!service) {
    return;
  }
  const sub = interaction.options.getSubcommand();
  const commandName = interaction.options.getString("command", true);

  if (!service.configurableCommands().includes(commandName)) {
    await interaction.reply({
      embeds: [warnEmbed("Unknown command", `\`${commandName}\` is not a configurable command.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "list") {
    const roles = service.listRoles(commandName);
    await interaction.reply({
      embeds: [successEmbed(`Roles for /${commandName}`, formatRoles(interaction, roles))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "reset") {
    await service.resetCommand(commandName);
    await interaction.reply({
      embeds: [successEmbed(`Reset /${commandName}`, "All allowed roles cleared. Admins only now.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole("role", true);
  if (sub === "add") {
    await service.addRole(commandName, role.id);
    await interaction.reply({
      embeds: [successEmbed(`Updated /${commandName}`, `<@&${role.id}> may now use this command.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "remove") {
    await service.removeRole(commandName, role.id);
    await interaction.reply({
      embeds: [successEmbed(`Updated /${commandName}`, `<@&${role.id}> may no longer use this command.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
