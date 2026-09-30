// /eventdm-exclusions
// Arguments: subcommand add|remove|list, role (for add/remove)
// Access: configurable
// What it does: manages the list of roles that never receive event DMs.
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import { successEmbed } from "../ui/embeds";

export const access: AccessLevel = "configurable";

export const data = new SlashCommandBuilder()
  .setName("eventdm-exclusions")
  .setDescription("Manage roles that never receive event DMs.")
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a role to the exclusion list.")
      .addRoleOption((o) => o.setName("role").setDescription("The role to exclude.").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a role from the exclusion list.")
      .addRoleOption((o) => o.setName("role").setDescription("The role to stop excluding.").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Show the excluded roles."));

// The settings store is injected once at wiring time.
let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const ids = settings.get().eventDmExcludedRoleIds;
    const text =
      ids.length === 0
        ? "_No roles are excluded._"
        : ids
            .map((id) => {
              const role = interaction.guild?.roles.cache.get(id);
              return role ? `<@&${id}>` : `\`${id}\` (deleted role)`;
            })
            .join(", ");
    await interaction.reply({
      embeds: [successEmbed("Event DM exclusions", text)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole("role", true);
  if (sub === "add") {
    await settings.update((draft) => {
      if (!draft.eventDmExcludedRoleIds.includes(role.id)) {
        draft.eventDmExcludedRoleIds.push(role.id);
      }
    });
    await interaction.reply({
      embeds: [successEmbed("Exclusion added", `<@&${role.id}> will no longer receive event DMs.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "remove") {
    await settings.update((draft) => {
      draft.eventDmExcludedRoleIds = draft.eventDmExcludedRoleIds.filter((id) => id !== role.id);
    });
    await interaction.reply({
      embeds: [successEmbed("Exclusion removed", `<@&${role.id}> may now receive event DMs.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
