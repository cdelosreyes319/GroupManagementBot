// /stats-source
// Arguments: subcommands add | list | remove | edit | test | field-add |
//   field-add-ratio | field-remove | field-move | field-list
// Access: configurable
// What it does: manages Google Sheet stats sources and their display fields.
// Secrets and full URLs are never shown; only the URL host is displayed.
import {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import type { AccessLevel } from "./types";
import type { SettingsStore } from "../storage/settingsStore";
import type { StatsSource } from "../storage/types";
import { LIMITS } from "../config/constants";
import { TTLCache } from "../utils/ttlCache";
import { buildCustomId } from "../interactions/customId";
import { successEmbed, warnEmbed } from "../ui/embeds";
import { addValueField, addRatioField, removeField, moveField } from "../services/statsFields";
import { queryStatsEndpoint, endpointErrorMessage } from "../api/statsEndpoint";

export const access: AccessLevel = "configurable";

// A pending "add" draft holding the slash-option values until the modal (URL +
// secret) is submitted. Plain values only, TTL 5 minutes.
export type PendingSource = {
  id: string;
  displayName: string;
  tab: string;
  headerRow: number;
  usernameHeader: string;
  startColumn: string;
};

// Settings store and pending-add cache, injected/created at wiring time.
let settings: SettingsStore | null = null;
const pendingAdds = new TTLCache<string, PendingSource>(20, LIMITS.eventDmPreviewTtlMs);

// Wires the settings store into this command (called from main.ts).
export function configure(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

// Exposes the pending-add cache to the interaction handler.
export function takePendingSource(id: string): PendingSource | undefined {
  const pending = pendingAdds.get(id);
  if (pending) {
    pendingAdds.delete(id);
  }
  return pending;
}

export const data = new SlashCommandBuilder()
  .setName("stats-source")
  .setDescription("Manage Google Sheet stats sources.")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add a source (opens a form for the URL and secret).")
      .addStringOption((o) => o.setName("name").setDescription("Display name.").setRequired(true))
      .addStringOption((o) => o.setName("tab").setDescription("Sheet tab name.").setRequired(true))
      .addIntegerOption((o) => o.setName("header-row").setDescription("Row number with headers.").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("username-header").setDescription("Header of the username column.").setRequired(true))
      .addStringOption((o) => o.setName("start-column").setDescription("Column the table starts at (default A).")),
  )
  .addSubcommand((s) => s.setName("list").setDescription("List sources (host only, never secrets)."))
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a source.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("edit")
      .setDescription("Edit a source's settings.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("tab").setDescription("New tab name."))
      .addIntegerOption((o) => o.setName("header-row").setDescription("New header row.").setMinValue(1))
      .addStringOption((o) => o.setName("start-column").setDescription("New start column."))
      .addStringOption((o) => o.setName("username-header").setDescription("New username header."))
      .addIntegerOption((o) => o.setName("accent-color").setDescription("Accent colour (decimal RGB)."))
      .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable this source.")),
  )
  .addSubcommand((s) =>
    s
      .setName("test")
      .setDescription("Test a source and report missing headers.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("field-add")
      .setDescription("Add a display field.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("header").setDescription("Sheet column header.").setRequired(true))
      .addStringOption((o) => o.setName("label").setDescription("Display label.").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("format")
          .setDescription("Value format.")
          .setRequired(true)
          .addChoices({ name: "text", value: "text" }, { name: "number", value: "number" }, { name: "percent", value: "percent" }),
      )
      .addBooleanOption((o) => o.setName("inline").setDescription("Show inline (default true).")),
  )
  .addSubcommand((s) =>
    s
      .setName("field-add-ratio")
      .setDescription("Add a ratio field (numerator ÷ denominator).")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("numerator").setDescription("Numerator column header.").setRequired(true))
      .addStringOption((o) => o.setName("denominator").setDescription("Denominator column header.").setRequired(true))
      .addStringOption((o) => o.setName("label").setDescription("Display label.").setRequired(true))
      .addBooleanOption((o) => o.setName("inline").setDescription("Show inline (default true).")),
  )
  .addSubcommand((s) =>
    s
      .setName("field-remove")
      .setDescription("Remove a display field by label.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("label").setDescription("Field label to remove.").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("field-move")
      .setDescription("Move a display field to a new position.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("label").setDescription("Field label to move.").setRequired(true))
      .addIntegerOption((o) => o.setName("position").setDescription("New 1-based position.").setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName("field-list")
      .setDescription("List a source's display fields.")
      .addStringOption((o) => o.setName("source").setDescription("The source.").setRequired(true).setAutocomplete(true)),
  );

// Autocomplete for the `source` option: source names from settings.
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!settings) {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused().toLowerCase();
  const choices = settings
    .get()
    .statsSources.filter((s) => s.displayName.toLowerCase().includes(typed) || s.id.includes(typed))
    .slice(0, 25)
    .map((s) => ({ name: s.displayName, value: s.id }));
  await interaction.respond(choices);
}

// Finds a source by id, or replies with a warning and returns null.
async function requireSource(
  interaction: ChatInputCommandInteraction,
  id: string,
): Promise<StatsSource | null> {
  const source = settings!.get().statsSources.find((s) => s.id === id);
  if (!source) {
    await interaction.reply({
      embeds: [warnEmbed("Unknown source", "That source does not exist.")],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return source;
}

// Applies a field operation result: save on success or warn on error.
async function applyFieldChange(
  interaction: ChatInputCommandInteraction,
  sourceId: string,
  result: { ok: true; fields: StatsSource["fields"] } | { ok: false; error: string },
): Promise<void> {
  if (!result.ok) {
    await interaction.reply({ embeds: [warnEmbed("Cannot change field", result.error)], flags: MessageFlags.Ephemeral });
    return;
  }
  await settings!.update((draft) => {
    const source = draft.statsSources.find((s) => s.id === sourceId);
    if (source) {
      source.fields = result.fields;
    }
  });
  await interaction.reply({ embeds: [successEmbed("Fields updated", "The field list was saved.")], flags: MessageFlags.Ephemeral });
}

// Builds a short slug id from a display name.
function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "source";
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    await handleAdd(interaction);
    return;
  }
  if (sub === "list") {
    await handleList(interaction);
    return;
  }

  // All remaining subcommands take a `source` option.
  const sourceId = interaction.options.getString("source", true);
  const source = await requireSource(interaction, sourceId);
  if (!source) {
    return;
  }

  switch (sub) {
    case "remove":
      await settings.update((draft) => {
        draft.statsSources = draft.statsSources.filter((s) => s.id !== sourceId);
      });
      await interaction.reply({ embeds: [successEmbed("Source removed", `Removed **${source.displayName}**.`)], flags: MessageFlags.Ephemeral });
      return;
    case "edit":
      await handleEdit(interaction, sourceId);
      return;
    case "test":
      await handleTest(interaction, source);
      return;
    case "field-add":
      await applyFieldChange(
        interaction,
        sourceId,
        addValueField(
          source.fields,
          interaction.options.getString("header", true),
          interaction.options.getString("label", true),
          interaction.options.getString("format", true),
          interaction.options.getBoolean("inline") ?? true,
        ),
      );
      return;
    case "field-add-ratio":
      await applyFieldChange(
        interaction,
        sourceId,
        addRatioField(
          source.fields,
          interaction.options.getString("numerator", true),
          interaction.options.getString("denominator", true),
          interaction.options.getString("label", true),
          interaction.options.getBoolean("inline") ?? true,
        ),
      );
      return;
    case "field-remove":
      await applyFieldChange(interaction, sourceId, removeField(source.fields, interaction.options.getString("label", true)));
      return;
    case "field-move":
      await applyFieldChange(
        interaction,
        sourceId,
        moveField(source.fields, interaction.options.getString("label", true), interaction.options.getInteger("position", true)),
      );
      return;
    case "field-list":
      await handleFieldList(interaction, source);
      return;
  }
}

// add: store the slash options and open a modal for URL + secret.
async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString("name", true);
  const id = slugFromName(name);
  if (settings!.get().statsSources.some((s) => s.id === id)) {
    await interaction.reply({ embeds: [warnEmbed("Duplicate", `A source named "${name}" already exists.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  pendingAdds.set(id, {
    id,
    displayName: name,
    tab: interaction.options.getString("tab", true),
    headerRow: interaction.options.getInteger("header-row", true),
    usernameHeader: interaction.options.getString("username-header", true),
    startColumn: interaction.options.getString("start-column") ?? "A",
  });

  const modal = new ModalBuilder().setCustomId(buildCustomId("statssource", "add", id)).setTitle("Stats endpoint");
  const urlInput = new TextInputBuilder()
    .setCustomId("url")
    .setLabel("Endpoint URL (script.google.com)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const secretInput = new TextInputBuilder()
    .setCustomId("secret")
    .setLabel("Shared secret")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(secretInput),
  );
  await interaction.showModal(modal);
}

// list: show each source with URL host only, never the secret or full URL.
async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const sources = settings!.get().statsSources;
  if (sources.length === 0) {
    await interaction.reply({ embeds: [successEmbed("Stats sources", "_No sources configured._")], flags: MessageFlags.Ephemeral });
    return;
  }
  const lines = sources.map((s) => {
    const host = urlHost(s.scriptUrl);
    const state = s.enabled ? "enabled" : "disabled";
    return `**${s.displayName}** (\`${s.id}\`) — ${host}, tab "${s.tab}", ${s.fields.length} fields, ${state}`;
  });
  await interaction.reply({ embeds: [successEmbed("Stats sources", lines.join("\n"))], flags: MessageFlags.Ephemeral });
}

// edit: apply any provided option to the source.
async function handleEdit(interaction: ChatInputCommandInteraction, sourceId: string): Promise<void> {
  const tab = interaction.options.getString("tab");
  const headerRow = interaction.options.getInteger("header-row");
  const startColumn = interaction.options.getString("start-column");
  const usernameHeader = interaction.options.getString("username-header");
  const accentColor = interaction.options.getInteger("accent-color");
  const enabled = interaction.options.getBoolean("enabled");

  await settings!.update((draft) => {
    const source = draft.statsSources.find((s) => s.id === sourceId);
    if (!source) {
      return;
    }
    if (tab !== null) source.tab = tab;
    if (headerRow !== null) source.headerRow = headerRow;
    if (startColumn !== null) source.startColumn = startColumn;
    if (usernameHeader !== null) source.usernameHeader = usernameHeader;
    if (accentColor !== null) source.accentColor = accentColor;
    if (enabled !== null) source.enabled = enabled;
  });
  await interaction.reply({ embeds: [successEmbed("Source updated", "Changes saved.")], flags: MessageFlags.Ephemeral });
}

// test: call the endpoint with a connection-test username and report missing headers.
async function handleTest(interaction: ChatInputCommandInteraction, source: StatsSource): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const headers = neededHeaders(source);
  const result = await queryStatsEndpoint(source, ["__connection_test__"], headers);
  if (!result.ok) {
    await interaction.editReply({ embeds: [warnEmbed("Test failed", endpointErrorMessage(result.error))] });
    return;
  }
  const missing = result.missingHeaders;
  const body = missing.length > 0 ? `Missing headers: ${missing.join(", ")}` : "All configured headers were found.";
  await interaction.editReply({ embeds: [successEmbed("Test succeeded", body)] });
}

// field-list: show the source's fields in order.
async function handleFieldList(interaction: ChatInputCommandInteraction, source: StatsSource): Promise<void> {
  if (source.fields.length === 0) {
    await interaction.reply({ embeds: [successEmbed(`Fields: ${source.displayName}`, "_No fields configured._")], flags: MessageFlags.Ephemeral });
    return;
  }
  const lines = source.fields.map((f, i) => {
    const desc = f.kind === "ratio" ? `ratio ${f.numeratorHeader}÷${f.denominatorHeader}` : `${f.header} (${f.format})`;
    return `${i + 1}. **${f.label}** — ${desc}${f.inline ? "" : " (block)"}`;
  });
  await interaction.reply({ embeds: [successEmbed(`Fields: ${source.displayName}`, lines.join("\n"))], flags: MessageFlags.Ephemeral });
}

// Returns the URL host, or "unknown host" if the URL cannot be parsed.
function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown host";
  }
}

// Collects the headers a source's fields need (plus the username header).
function neededHeaders(source: StatsSource): string[] {
  const headers = new Set<string>([source.usernameHeader]);
  for (const field of source.fields) {
    if (field.kind === "ratio") {
      headers.add(field.numeratorHeader);
      headers.add(field.denominatorHeader);
    } else {
      headers.add(field.header);
    }
  }
  return [...headers];
}
