// interactions/eventDmInteractions.ts
// The "eventdm" component handler: the modal submit (load members, select
// recipients, show the preview) and the button router. Member lookups live in
// eventDmMembers.ts, sending in eventDmSend.ts, the attendance poll in
// eventDmPoll.ts.
import {
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { ComponentHandler } from "./router";
import { isAnswer } from "../storage/types";
import { selectRecipients, type Candidate } from "../services/recipientSelector";
import { buildCustomId, parseCustomId } from "./customId";
import { successEmbed, warnEmbed, buildEventDmEmbed } from "../ui/embeds";
import { getEventDmDeps } from "./eventDmContext";
import { handleRsvp } from "./eventDmPoll";
import { confirmSend } from "./eventDmSend";
import { fetchRoleMembers, officerDisplayName } from "./eventDmMembers";

// Handles the modal submit: fetch members, select recipients, show the preview.
async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    return;
  }
  const deps = getEventDmDeps();
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }
  const draft = deps.eventDm.get(parsed.id);
  if (!draft) {
    await interaction.reply({
      embeds: [warnEmbed("Expired", "This event preview has expired. Please run /eventdm again.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Blacklisted users (tripped the rate limit) may not use /eventdm at all.
  if (deps.settings.get().eventDmBlacklist.includes(interaction.user.id)) {
    await interaction.reply({
      embeds: [
        warnEmbed(
          "Blocked",
          "You are blacklisted from /eventdm for exceeding the rate limit. Contact an administrator.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue("title");
  const message = interaction.fields.getTextInputValue("message");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const roleMembers = await fetchRoleMembers(interaction, draft.roleId);
  if (!roleMembers) {
    return;
  }
  const candidates: Candidate[] = [...roleMembers.values()].map((member) => ({
    id: member.id,
    isBot: member.user.bot,
    roleIds: [...member.roles.cache.keys()],
    joinedAt: member.joinedTimestamp ?? 0,
  }));

  const selection = selectRecipients({
    candidates,
    senderId: draft.requesterId,
    excludedRoleIds: deps.settings.get().eventDmExcludedRoleIds,
    limit: draft.limit,
    lastActive: (userId) => deps.activity.getLastActive(userId),
  });

  // Save the completed draft (title, message, officer name, recipient IDs +
  // display names). Names come from the fetched members, not the member cache,
  // which is capped and would leave most recipients as raw IDs.
  const displayNames: Record<string, string> = {};
  for (const recipient of selection.recipients) {
    displayNames[recipient.id] = roleMembers.get(recipient.id)?.displayName ?? recipient.id;
  }
  draft.title = title;
  draft.message = message;
  draft.requesterName = officerDisplayName(interaction);
  draft.recipientIds = selection.recipients.map((r) => r.id);
  draft.displayNames = displayNames;

  if (selection.recipients.length === 0) {
    await interaction.editReply({
      embeds: [warnEmbed("No recipients", "No eligible members would receive this DM.")],
    });
    return;
  }

  const pollNote = draft.resultsChannelId
    ? "Yes (Attending / Maybe / Can't attend buttons)"
    : "No";
  const preview = buildEventDmEmbed(title, message, draft.requesterName, interaction.guild!.name);
  const summary = warnEmbed(
    "Confirm event DM",
    [
      `Role: ${draft.roleName}`,
      `Eligible: ${selection.eligibleCount}`,
      `Excluded: ${selection.excludedCount}`,
      `Will receive: ${selection.recipients.length}`,
      `Attendance poll: ${pollNote}`,
    ].join("\n"),
  );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId("eventdm", "confirm", draft.id))
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildCustomId("eventdm", "cancel", draft.id))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [summary, preview], components: [buttons] });
}

// Handles the Confirm/Cancel buttons and RSVP buttons.
async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  // RSVP buttons work in DMs and are handled separately (no requester check).
  if (parsed.action === "rsvp") {
    if (isAnswer(parsed.extra)) {
      await handleRsvp(interaction, parsed.id, parsed.extra);
    }
    return;
  }

  if (!interaction.inGuild()) {
    return;
  }

  const deps = getEventDmDeps();
  const draft = deps.eventDm.get(parsed.id);
  if (!draft) {
    // The preview is only visible to its officer, so replacing it is safe. With
    // no timers allowed per preview, its buttons are removed on the first press
    // after it expires (R4.8).
    await interaction.update({
      embeds: [warnEmbed("Expired", "This event preview has expired. Please run /eventdm again.")],
      components: [],
    });
    return;
  }

  // Only the officer who created the preview may press its buttons.
  if (interaction.user.id !== draft.requesterId) {
    await interaction.reply({ content: "This prompt is not yours.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (parsed.action === "cancel") {
    const cancelled = deps.eventDm.cancel(draft);
    if (!cancelled.ok) {
      await interaction.reply({ embeds: [warnEmbed("Cannot cancel", cancelled.why)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({ embeds: [successEmbed("Cancelled", "No DMs were sent.")], components: [] });
    return;
  }

  if (parsed.action === "confirm") {
    await confirmSend(interaction, draft);
  }
}

// The component handler registered under the "eventdm" custom-ID prefix.
export const eventDmHandler: ComponentHandler = {
  commandName: "eventdm",
  handleButton,
  handleModal,
};
