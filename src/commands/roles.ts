// /roles
// Arguments: subcommand group special-assignment | regiment, each with
//   add (role, optional label) | remove (role) | list
// Access: configurable
// What it does: manages the Discord roles that /userinfo shows as special
// assignments (e.g. Eagle Bearer) and as regiments. Stores role IDs + labels.
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import type { RoleLabel } from "../storage/types";
import { successEmbed, warnEmbed } from "../ui/embeds";

export const access: AccessLevel = "configurable";

let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

// Builds one subcommand group (special-assignment or regiment) with add/remove/list.
function buildGroup(name: string, noun: string) {
  return (group: import("discord.js").SlashCommandSubcommandGroupBuilder) =>
    group
      .setName(name)
      .setDescription(`Manage ${noun} roles shown on /userinfo.`)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription(`Add a ${noun} role.`)
          .addRoleOption((o) => o.setName("role").setDescription("The Discord role.").setRequired(true))
          .addStringOption((o) => o.setName("label").setDescription("Display label (defaults to the role name).")),
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription(`Remove a ${noun} role.`)
          .addRoleOption((o) => o.setName("role").setDescription("The Discord role.").setRequired(true)),
      )
      .addSubcommand((s) => s.setName("list").setDescription(`List the ${noun} roles.`));
}

export const data = new SlashCommandBuilder()
  .setName("roles")
  .setDescription("Manage special-assignment and regiment roles for /userinfo.")
  .setDMPermission(false)
  .addSubcommandGroup(buildGroup("special-assignment", "special assignment"))
  .addSubcommandGroup(buildGroup("regiment", "regiment"));

// Reads the list for a group from settings (tolerating an old file missing it).
function getList(group: string): RoleLabel[] {
  const s = settings!.get();
  return group === "special-assignment" ? s.specialAssignments ?? [] : s.regiments ?? [];
}

// Applies a change to the correct list in the settings draft.
function setList(draft: import("../storage/types").Settings, group: string, list: RoleLabel[]): void {
  if (group === "special-assignment") {
    draft.specialAssignments = list;
  } else {
    draft.regiments = list;
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand();
  const noun = group === "special-assignment" ? "special assignment" : "regiment";

  if (sub === "list") {
    const list = getList(group);
    const text =
      list.length === 0
        ? `_No ${noun} roles configured._`
        : list
            .map((entry) => {
              const role = interaction.guild?.roles.cache.get(entry.roleId);
              const shown = role ? `<@&${entry.roleId}>` : `\`${entry.roleId}\` (deleted role)`;
              return `${shown} — ${entry.label}`;
            })
            .join("\n");
    await interaction.reply({
      embeds: [successEmbed(`${capitalise(noun)} roles`, text)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole("role", true);

  if (sub === "add") {
    const label = interaction.options.getString("label") ?? role.name;
    if (getList(group).some((entry) => entry.roleId === role.id)) {
      await interaction.reply({
        embeds: [warnEmbed("Already added", `<@&${role.id}> is already a ${noun} role.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await settings.update((draft) => {
      const list = group === "special-assignment" ? draft.specialAssignments ?? [] : draft.regiments ?? [];
      list.push({ roleId: role.id, label });
      setList(draft, group, list);
    });
    await interaction.reply({
      embeds: [successEmbed(`${capitalise(noun)} added`, `<@&${role.id}> will show as "${label}".`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "remove") {
    await settings.update((draft) => {
      const list = (group === "special-assignment" ? draft.specialAssignments ?? [] : draft.regiments ?? []).filter(
        (entry) => entry.roleId !== role.id,
      );
      setList(draft, group, list);
    });
    await interaction.reply({
      embeds: [successEmbed(`${capitalise(noun)} removed`, `<@&${role.id}> is no longer a ${noun} role.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

// Capitalises the first letter of a label for embed titles.
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
