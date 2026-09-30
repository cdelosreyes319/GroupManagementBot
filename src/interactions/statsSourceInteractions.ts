// interactions/statsSourceInteractions.ts
// Handles the /stats-source "add" modal: validates the endpoint URL host, runs
// a test call, and saves the source only if the test succeeds. The URL and
// secret are never logged.
import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import type { ComponentHandler } from "./router";
import type { SettingsStore } from "../storage/settingsStore";
import type { StatsSource } from "../storage/types";
import { parseCustomId } from "./customId";
import { takePendingSource } from "../commands/statssource";
import { isAllowedEndpointHost, queryStatsEndpoint, endpointErrorMessage } from "../api/statsEndpoint";
import { successEmbed, warnEmbed } from "../ui/embeds";

let settings: SettingsStore | null = null;

// Wires the settings store into this handler (called from main.ts).
export function configureStatsSourceInteractions(settingsStore: SettingsStore): void {
  settings = settingsStore;
}

// Handles the add modal: build the source, test it, and save on success.
async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!settings) {
    return;
  }
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }
  const pending = takePendingSource(parsed.id);
  if (!pending) {
    await interaction.reply({
      embeds: [warnEmbed("Expired", "This form expired. Please run /stats-source add again.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const url = interaction.fields.getTextInputValue("url").trim();
  const secret = interaction.fields.getTextInputValue("secret");

  if (!isAllowedEndpointHost(url)) {
    await interaction.reply({
      embeds: [warnEmbed("Bad URL", "The endpoint URL must be a script.google.com address.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const source: StatsSource = {
    id: pending.id,
    displayName: pending.displayName,
    scriptUrl: url,
    secret,
    tab: pending.tab,
    headerRow: pending.headerRow,
    startColumn: pending.startColumn,
    usernameHeader: pending.usernameHeader,
    accentColor: null,
    enabled: true,
    fields: [],
  };

  // Test call: only the username header is needed for a connection test.
  const result = await queryStatsEndpoint(source, ["__connection_test__"], [source.usernameHeader]);
  if (!result.ok) {
    await interaction.editReply({ embeds: [warnEmbed("Not saved", endpointErrorMessage(result.error))] });
    return;
  }

  await settings.update((draft) => {
    draft.statsSources.push(source);
  });
  await interaction.editReply({
    embeds: [successEmbed("Source added", `Saved **${source.displayName}** (\`${source.id}\`). Add fields with /stats-source field-add.`)],
  });
}

// The component handler registered under the "statssource" custom-ID prefix.
export const statsSourceHandler: ComponentHandler = {
  commandName: "stats-source",
  handleModal,
};
