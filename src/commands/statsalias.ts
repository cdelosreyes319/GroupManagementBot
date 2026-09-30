// /stats-alias
// Arguments: subcommand add | remove | list, user (Discord user), name (for add/remove)
// Access: configurable
// What it does: manages a player's manual username aliases, keyed by Roblox
// user ID, for finding them in sheets when their username changed.
import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import { LIMITS } from "../config/constants";
import { getAccountLookup } from "../services/accountLookup";
import { successEmbed, warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";
import { normaliseName } from "../utils/text";

export const access: AccessLevel = "configurable";

let settings: SettingsStore | null = null;

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

export const data = new SlashCommandBuilder()
  .setName("stats-alias")
  .setDescription("Manage a player's sheet name aliases.")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add an alias for a player.")
      .addUserOption((o) => o.setName("user").setDescription("The Discord user.").setRequired(true))
      .addStringOption((o) => o.setName("name").setDescription("The alias to add.").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove an alias for a player.")
      .addUserOption((o) => o.setName("user").setDescription("The Discord user.").setRequired(true))
      .addStringOption((o) => o.setName("name").setDescription("The alias to remove.").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List a player's aliases.")
      .addUserOption((o) => o.setName("user").setDescription("The Discord user.").setRequired(true)),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user", true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lookup = await getAccountLookup()(user.id);
  if (!lookup.ok) {
    const text = lookup.reason === "not_linked" ? MESSAGES.notLinked : MESSAGES.bloxlinkError;
    await interaction.editReply({ embeds: [warnEmbed("Could not resolve account", text)] });
    return;
  }
  const key = String(lookup.account.userId);

  if (sub === "list") {
    const aliases = settings.get().usernameAliases[key] ?? [];
    const body = aliases.length > 0 ? aliases.map((a) => `• ${a}`).join("\n") : "_No aliases set._";
    await interaction.editReply({ embeds: [successEmbed(`Aliases: ${lookup.account.username}`, body)] });
    return;
  }

  const name = interaction.options.getString("name", true).trim();

  if (sub === "add") {
    const existing = settings.get().usernameAliases[key] ?? [];
    if (existing.length >= LIMITS.maxAliasesPerPlayer) {
      await interaction.editReply({
        embeds: [warnEmbed("Too many aliases", `A player can have at most ${LIMITS.maxAliasesPerPlayer} aliases.`)],
      });
      return;
    }
    if (existing.some((a) => normaliseName(a) === normaliseName(name))) {
      await interaction.editReply({ embeds: [warnEmbed("Duplicate", "That alias already exists.")] });
      return;
    }
    await settings.update((draft) => {
      const list = draft.usernameAliases[key] ?? [];
      list.push(name);
      draft.usernameAliases[key] = list;
    });
    await interaction.editReply({ embeds: [successEmbed("Alias added", `Added "${name}" for ${lookup.account.username}.`)] });
    return;
  }

  if (sub === "remove") {
    await settings.update((draft) => {
      const list = draft.usernameAliases[key] ?? [];
      draft.usernameAliases[key] = list.filter((a) => normaliseName(a) !== normaliseName(name));
      if (draft.usernameAliases[key].length === 0) {
        delete draft.usernameAliases[key];
      }
    });
    await interaction.editReply({ embeds: [successEmbed("Alias removed", `Removed "${name}" for ${lookup.account.username}.`)] });
    return;
  }
}
