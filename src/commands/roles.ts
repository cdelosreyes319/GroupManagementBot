// /roles
// Arguments: subcommand group regiment | special-assignment | imperial-honour,
//   each with add (role, optional label, optional emoji) | remove (role) | list
// Access: configurable
// What it does: manages the Discord roles /userinfo shows as regiments, special
// assignments, and imperial honours. Stores role IDs, labels, and an optional
// emoji per entry.
import {
  SlashCommandBuilder,
  MessageFlags,
  type SlashCommandSubcommandGroupBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import type { RoleLabel, Settings } from "../storage/types";
import { successEmbed, warnEmbed } from "../ui/embeds";

export const access: AccessLevel = "configurable";

// Maps each subcommand-group name to its settings key and a human-readable noun.
const GROUPS = {
  regiment: { key: "regiments", noun: "regiment" },
  "special-assignment": { key: "specialAssignments", noun: "special assignment" },
  "imperial-honour": { key: "imperialHonours", noun: "imperial honour" },
} as const satisfies Record<string, { key: keyof Settings; noun: string }>;

type GroupName = keyof typeof GROUPS;

let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

// Builds one subcommand group with add/remove/list.
function buildGroup(name: GroupName, noun: string) {
  return (group: SlashCommandSubcommandGroupBuilder) =>
    group
      .setName(name)
      .setDescription(`Manage ${noun} roles shown on /userinfo.`)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription(`Add a ${noun} role.`)
          .addRoleOption((o) => o.setName("role").setDescription("The Discord role.").setRequired(true))
          .addStringOption((o) => o.setName("label").setDescription("Display label (defaults to the role name)."))
          .addStringOption((o) =>
            o.setName("emoji").setDescription("Emoji shown before the label (unicode or a custom emoji)."),
          ),
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
  .setDescription("Manage regiment, special-assignment, and imperial-honour roles for /userinfo.")
  .setDMPermission(false)
  .addSubcommandGroup(buildGroup("regiment", "regiment"))
  .addSubcommandGroup(buildGroup("special-assignment", "special assignment"))
  .addSubcommandGroup(buildGroup("imperial-honour", "imperial honour"));

// Reads the list for a group from settings (tolerating an old file missing it).
function getList(group: GroupName): RoleLabel[] {
  const key = GROUPS[group].key;
  return (settings!.get()[key] as RoleLabel[] | undefined) ?? [];
}

// Writes the list for a group back into the settings draft.
function setList(draft: Settings, group: GroupName, list: RoleLabel[]): void {
  (draft[GROUPS[group].key] as RoleLabel[]) = list;
}

// Formats one entry for the `list` reply, marking deleted roles.
function formatEntry(interaction: ChatInputCommandInteraction, entry: RoleLabel): string {
  const role = interaction.guild?.roles.cache.get(entry.roleId);
  const mention = role ? `<@&${entry.roleId}>` : `\`${entry.roleId}\` (deleted role)`;
  const prefix = entry.emoji ? `${entry.emoji} ` : "";
  return `${mention} — ${prefix}${entry.label}`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const group = interaction.options.getSubcommandGroup(true) as GroupName;
  const sub = interaction.options.getSubcommand();
  const noun = GROUPS[group].noun;

  if (sub === "list") {
    const list = getList(group);
    const text =
      list.length === 0
        ? `_No ${noun} roles configured._`
        : list.map((entry) => formatEntry(interaction, entry)).join("\n");
    await interaction.reply({
      embeds: [successEmbed(`${capitalise(noun)} roles`, text)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole("role", true);

  if (sub === "add") {
    const label = interaction.options.getString("label") ?? role.name;
    const emoji = interaction.options.getString("emoji");
    if (getList(group).some((entry) => entry.roleId === role.id)) {
      await interaction.reply({
        embeds: [warnEmbed("Already added", `<@&${role.id}> is already a ${noun} role.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await settings.update((draft) => {
      const list = getListFromDraft(draft, group);
      list.push({ roleId: role.id, label, emoji: emoji ?? null });
      setList(draft, group, list);
    });
    const shown = emoji ? `${emoji} ${label}` : label;
    await interaction.reply({
      embeds: [successEmbed(`${capitalise(noun)} added`, `<@&${role.id}> will show as "${shown}".`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "remove") {
    await settings.update((draft) => {
      const list = getListFromDraft(draft, group).filter((entry) => entry.roleId !== role.id);
      setList(draft, group, list);
    });
    await interaction.reply({
      embeds: [successEmbed(`${capitalise(noun)} removed`, `<@&${role.id}> is no longer a ${noun} role.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

// Reads a group's list from a settings draft (for use inside update()).
function getListFromDraft(draft: Settings, group: GroupName): RoleLabel[] {
  return (draft[GROUPS[group].key] as RoleLabel[] | undefined) ?? [];
}

// Capitalises the first letter of a label for embed titles.
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
