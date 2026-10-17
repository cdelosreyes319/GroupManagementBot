// interactions/eventDmPoll.ts
// The attendance-poll side of /eventdm: the RSVP buttons in each DM, the
// summary embed in the results channel, and the handler for button presses
// that recipients make inside their DMs.
import {
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type Message,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";
import { randomUUID } from "crypto";
import type { PendingBroadcast } from "../services/eventDmService";
import type { EventRecord, Answer } from "../storage/types";
import { LIMITS } from "../config/constants";
import { buildCustomId } from "./customId";
import { buildPollSummaryEmbed, type PollSummaryLines } from "../ui/embeds";
import { formatAnswerLine } from "../services/pollService";
import { getEventDmDeps } from "./eventDmContext";

// Builds the three RSVP buttons for a poll DM (yes / maybe / no).
export function rsvpButtons(eventId: string): ActionRowBuilder<ButtonBuilder> {
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
  const summary = getEventDmDeps().poll.buildSummary(event);
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
  if (!event.summaryMessageId) {
    return;
  }
  try {
    const channel = await getEventDmDeps().client.channels.fetch(event.resultsChannelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }
    const message = await (channel as TextChannel).messages.fetch(event.summaryMessageId);
    await message.edit({ embeds: [buildPollSummaryEmbed(event.title, summaryLines(event))] });
  } catch {
    console.error("Failed to edit poll summary message; continuing.");
  }
}

// Creates the EventRecord, posts the initial summary embed in the results
// channel, and saves its message ID. recipientIds start empty; the send loop
// adds each recipient just before their DM (addPollRecipient) and removes
// those whose DM failed (recordPollFailure). Returns the
// stored event.
export async function createPollEvent(draft: PendingBroadcast, title: string): Promise<EventRecord> {
  const deps = getEventDmDeps();
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
    recipientIds: [],
    displayNames: draft.displayNames,
    dmFailedCount: 0,
    answers: {},
  };

  try {
    const channel = await deps.client.channels.fetch(event.resultsChannelId);
    if (channel && channel.isTextBased()) {
      const posted = await (channel as TextChannel).send({
        embeds: [buildPollSummaryEmbed(title, summaryLines(event))],
        allowedMentions: { parse: [] },
      });
      event.summaryMessageId = posted.id;
    }
  } catch {
    console.error("Failed to post poll summary message; poll will still record answers.");
  }

  await deps.eventStore.upsert(event);
  return event;
}

// Adds one recipient to a poll just before their DM is sent, so their answer
// is accepted as soon as they can press a button.
export async function addPollRecipient(eventId: string, recipientId: string): Promise<void> {
  await getEventDmDeps().eventStore.update(eventId, (record) => {
    if (!record.recipientIds.includes(recipientId)) {
      record.recipientIds.push(recipientId);
    }
  });
}

// Records a failed DM on a poll as it happens: the recipient leaves the poll
// and counts as "DM failed" instead of "No answer". Edits the stored record in
// place so answers given during the send are kept.
export async function recordPollFailure(eventId: string, recipientId: string): Promise<void> {
  await getEventDmDeps().eventStore.update(eventId, (record) => {
    record.recipientIds = record.recipientIds.filter((id) => id !== recipientId);
    record.dmFailedCount++;
  });
}

// Handles an RSVP button press inside a DM. Records the answer, updates the DM,
// and requests a debounced summary edit. Works after a restart because the
// event is loaded from events.json.
export async function handleRsvp(interaction: ButtonInteraction, eventId: string, answer: Answer): Promise<void> {
  const deps = getEventDmDeps();
  const result = await deps.poll.recordAnswer(eventId, interaction.user.id, answer);

  // An unknown event was pruned from storage (R5.10), so it is closed too.
  if (result === "closed" || result === "unknown_event") {
    // Remove the buttons and tell the presser the poll is closed.
    await interaction.update({
      content: "This poll is now closed.",
      components: [],
    });
    return;
  }
  if (result === "not_a_recipient") {
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
