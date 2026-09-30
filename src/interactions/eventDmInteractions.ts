// interactions/eventDmInteractions.ts
// Handles the /eventdm modal submit (build recipients + preview), the
// Confirm/Cancel buttons (send loop, optional poll), and the RSVP buttons that
// recipients press inside their DMs.
import {
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Client,
  type Message,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { randomUUID } from "crypto";
import type { ComponentHandler } from "./router";
import type { SettingsStore } from "../storage/settingsStore";
import type { EventDmService, PendingBroadcast } from "../services/eventDmService";
import type { ActivityTracker } from "../services/activityTracker";
import type { PollService } from "../services/pollService";
import type { EventStore } from "../storage/eventStore";
import type { EventRecord, Answer } from "../storage/types";
import { LIMITS } from "../config/constants";
import { selectRecipients, type Candidate } from "../services/recipientSelector";
import { buildCustomId, parseCustomId } from "./customId";
import {
  successEmbed,
  warnEmbed,
  buildEventDmEmbed,
  buildPollSummaryEmbed,
  type PollSummaryLines,
} from "../ui/embeds";
import { formatAnswerLine } from "../services/pollService";
import { truncate } from "../utils/text";

// Everything the handler needs, injected at wiring time.
type Deps = {
  client: Client;
  settings: SettingsStore;
  eventDm: EventDmService;
  activity: ActivityTracker;
  poll: PollService;
  eventStore: EventStore;
};

let deps: Deps | null = null;

// Wires the handler dependencies (called from main.ts).
export function configureEventDmInteractions(d: Deps): void {
  deps = d;
}

// Builds the three RSVP buttons for a poll DM (yes / maybe / no).
function rsvpButtons(eventId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId("eventdm", "rsvp", eventId, "yes"))
      .setLabel("Attending")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildCustomId("eventdm", "rsvp", eventId, "maybe"))
      .setLabel("Maybe")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildCustomId("eventdm", "rsvp", eventId, "no"))
      .setLabel("Can't attend")
      .setStyle(ButtonStyle.Danger),
  );
}

// Builds the summary embed lines from an event record.
function summaryLines(event: EventRecord): PollSummaryLines {
  const summary = deps!.poll.buildSummary(event);
  return {
    yes: formatAnswerLine(summary.counts.yes, summary.names.yes, summary.counts.yes),
    maybe: formatAnswerLine(summary.counts.maybe, summary.names.maybe, summary.counts.maybe),
    no: formatAnswerLine(summary.counts.no, summary.names.no, summary.counts.no),
    noAnswer: summary.noAnswer,
    dmFailed: summary.dmFailed,
  };
}

// Edits the summary message in the results channel for an event. Missing
// message or channel is logged and ignored (never throws to the caller).
export async function editSummaryMessage(event: EventRecord): Promise<void> {
  if (!deps || !event.summaryMessageId) {
    return;
  }
  try {
    const channel = await deps.client.channels.fetch(event.resultsChannelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }
    const message = await (channel as TextChannel).messages.fetch(event.summaryMessageId);
    await message.edit({ embeds: [buildPollSummaryEmbed(event.title, summaryLines(event))] });
  } catch {
    console.error("Failed to edit poll summary message; continuing.");
  }
}

// Handles the modal submit: fetch members, select recipients, show the preview.
async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!deps || !interaction.inGuild()) {
    return;
  }
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

  const title = interaction.fields.getTextInputValue("title");
  const message = interaction.fields.getTextInputValue("message");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild!;
  await guild.members.fetch();
  const roleMembers = guild.roles.cache.get(draft.roleId)?.members;
  const candidates: Candidate[] = [...(roleMembers?.values() ?? [])].map((member) => ({
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
    lastActive: (userId) => deps!.activity.getLastActive(userId),
  });

  // Save the completed draft (title, message, recipient IDs + display names).
  const displayNames: Record<string, string> = {};
  for (const recipient of selection.recipients) {
    displayNames[recipient.id] = guild.members.cache.get(recipient.id)?.displayName ?? recipient.id;
  }
  draft.title = title;
  draft.message = message;
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
  const preview = buildEventDmEmbed(title, message, interaction.user.username, guild.name);
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
  if (!deps) {
    return;
  }
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  // RSVP buttons work in DMs and are handled separately (no requester check).
  if (parsed.action === "rsvp") {
    await handleRsvp(interaction, parsed.id, parsed.extra as Answer);
    return;
  }

  if (!interaction.inGuild()) {
    return;
  }

  const draft = deps.eventDm.get(parsed.id);
  if (!draft) {
    await interaction.reply({
      embeds: [warnEmbed("Expired", "This event preview has expired.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Only the officer who created the preview may press its buttons.
  if (interaction.user.id !== draft.requesterId) {
    await interaction.reply({ content: "This prompt is not yours.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (parsed.action === "cancel") {
    deps.eventDm.remove(draft.id);
    await interaction.update({ embeds: [successEmbed("Cancelled", "No DMs were sent.")], components: [] });
    return;
  }

  if (parsed.action === "confirm") {
    await confirmSend(interaction, draft);
  }
}

// Runs the send after Confirm: checks lock/cooldown, removes the preview
// buttons, posts the poll summary (if a results channel was given), sends the
// DMs, and reports a summary.
async function confirmSend(interaction: ButtonInteraction, draft: PendingBroadcast): Promise<void> {
  const service = deps!.eventDm;
  const canStart = service.canStart(draft.guildId);
  if (!canStart.ok) {
    await interaction.reply({ embeds: [warnEmbed("Cannot start", canStart.why)], flags: MessageFlags.Ephemeral });
    return;
  }

  // Remove the preview components so Confirm cannot be pressed twice.
  await interaction.update({
    embeds: [successEmbed("Sending…", `Sending ${draft.recipientIds.length} DMs.`)],
    components: [],
  });
  service.remove(draft.id);

  const guild = interaction.guild!;
  const title = draft.title ?? "Event";
  const message = draft.message ?? "";
  const withPoll = draft.resultsChannelId !== null;

  // For a poll, create the event record and post the summary before sending.
  let event: EventRecord | null = null;
  if (withPoll) {
    event = await createPollEvent(draft, title);
  }

  // Sends one DM, with RSVP buttons when a poll is enabled.
  const sendOne = async (recipientId: string): Promise<void> => {
    const user = await deps!.client.users.fetch(recipientId);
    const embed = buildEventDmEmbed(title, message, interaction.user.username, guild.name);
    const components = event ? [rsvpButtons(event.id)] : [];
    await user.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
  };

  const result = await service.startSend(draft, sendOne, (done, total) => {
    interaction
      .editReply({ embeds: [successEmbed("Sending…", `Progress: ${done}/${total}`)] })
      .catch(() => undefined);
  });

  // For a poll, record the delivered recipients and DM failures on the event.
  if (event) {
    const delivered = draft.recipientIds.filter((id) => !result.failed.some((f) => f.id === id));
    const updated: EventRecord = {
      ...event,
      recipientIds: delivered,
      dmFailedCount: result.failed.length,
    };
    await deps!.eventStore.upsert(updated);
    await editSummaryMessage(updated);
  }

  const failedNames = result.failed.map((f) => f.name).join(", ");
  const summary = successEmbed(
    "Event DM complete",
    [
      `Sent: ${result.sent}`,
      `Failed: ${result.failed.length}`,
      result.failed.length > 0 ? `Failed recipients: ${truncate(failedNames, 1000)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  await interaction.editReply({ embeds: [summary] });
}

// Creates the EventRecord, posts the initial summary embed in the results
// channel, and saves its message ID. recipientIds start empty (filled after
// sending). Returns the stored event.
async function createPollEvent(draft: PendingBroadcast, title: string): Promise<EventRecord> {
  const now = Date.now();
  const event: EventRecord = {
    id: randomUUID().slice(0, 8),
    title,
    guildId: draft.guildId,
    createdBy: draft.requesterId,
    createdAt: now,
    closesAt: now + LIMITS.pollOpenMs,
    resultsChannelId: draft.resultsChannelId!,
    summaryMessageId: null,
    recipientIds: draft.recipientIds,
    displayNames: draft.displayNames,
    dmFailedCount: 0,
    answers: {},
  };

  try {
    const channel = await deps!.client.channels.fetch(event.resultsChannelId);
    if (channel && channel.isTextBased()) {
      const posted = await (channel as TextChannel).send({
        embeds: [buildPollSummaryEmbed(title, summaryLines(event))],
      });
      event.summaryMessageId = posted.id;
    }
  } catch {
    console.error("Failed to post poll summary message; poll will still record answers.");
  }

  await deps!.eventStore.upsert(event);
  return event;
}

// Handles an RSVP button press inside a DM. Records the answer, updates the DM,
// and requests a debounced summary edit. Works after a restart because the
// event is loaded from events.json.
async function handleRsvp(interaction: ButtonInteraction, eventId: string, answer: Answer): Promise<void> {
  if (!deps) {
    return;
  }
  const result = await deps.poll.recordAnswer(eventId, interaction.user.id, answer);

  if (result === "closed") {
    // Remove the buttons and tell the presser the poll is closed.
    await interaction.update({
      content: "This poll is now closed.",
      components: [],
    });
    return;
  }
  if (result === "not_a_recipient" || result === "unknown_event") {
    await interaction.reply({ content: "This poll is not open to you.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Recorded: update the DM to show the answer, keep the buttons usable.
  const label: Record<Answer, string> = { yes: "Attending", maybe: "Maybe", no: "Can't attend" };
  const dmMessage = interaction.message as Message;
  await interaction.update({
    content: `Your answer: **${label[answer]}**`,
    components: dmMessage.components,
  });
  deps.poll.requestSummaryEdit(eventId);
}

// The component handler registered under the "eventdm" custom-ID prefix.
export const eventDmHandler: ComponentHandler = {
  commandName: "eventdm",
  handleButton,
  handleModal,
};
