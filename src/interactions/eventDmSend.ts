// interactions/eventDmSend.ts
// Runs an /eventdm broadcast after Confirm: claim (lock/cooldown), rate-limit
// count (and blacklist + alert), optional poll, the send loop, the log entry,
// and the final summary. A send can outlive Discord's 15-minute interaction
// token, so nothing important waits on editing the officer's reply.
import { type ButtonInteraction, type EmbedBuilder, MessageFlags } from "discord.js";
import type { PendingBroadcast, SendResult } from "../services/eventDmService";
import { sendOutlivesReply } from "../services/eventDmService";
import { LIMITS } from "../config/constants";
import { successEmbed, warnEmbed, buildEventDmEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";
import { truncate } from "../utils/text";
import { getEventDmDeps } from "./eventDmContext";
import { addPollRecipient, createPollEvent, recordPollFailure, rsvpButtons } from "./eventDmPoll";

// Handles Confirm. The claim happens before the first await, so a
// double-click or another officer's Confirm a moment later is refused instead
// of starting a second send (R4.12). The lock is always released afterwards;
// the cooldown only starts if the broadcast actually began.
export async function confirmSend(interaction: ButtonInteraction, draft: PendingBroadcast): Promise<void> {
  const service = getEventDmDeps().eventDm;
  const claim = service.claimSend(draft);
  if (!claim.ok) {
    await interaction.reply({ embeds: [warnEmbed("Cannot start", claim.why)], flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await showSending(interaction, draft.recipientIds.length);
  } catch (error) {
    // Nothing was sent or counted, so free the server without a cooldown.
    service.releaseClaim(draft.guildId);
    throw error;
  }

  try {
    await runBroadcast(interaction, draft);
  } finally {
    service.finishSend(draft.guildId);
  }
}

// Replaces the preview with a "Sending…" notice, removing its buttons, and
// warns when the final summary will arrive by DM (R4.19).
async function showSending(interaction: ButtonInteraction, total: number): Promise<void> {
  const lines = [`Sending ${total} DMs.`];
  if (sendOutlivesReply(total)) {
    lines.push(MESSAGES.eventDmLongSend);
  }
  await interaction.update({ embeds: [successEmbed("Sending…", lines.join("\n"))], components: [] });
}

// Runs a claimed broadcast: counts it toward the rate limit, posts the poll
// summary (if a results channel was given), sends the DMs, logs, and reports
// a summary.
async function runBroadcast(interaction: ButtonInteraction, draft: PendingBroadcast): Promise<void> {
  const deps = getEventDmDeps();

  // Count the broadcast as soon as it is confirmed (R4.15), before the long
  // send loop, so it is counted even if the send outlives this interaction.
  await countTowardRateLimit(interaction.user.id);

  const guild = interaction.guild!;
  const title = draft.title ?? "Event";
  const message = draft.message ?? "";
  const officerName = draft.requesterName ?? interaction.user.displayName;
  const embed = buildEventDmEmbed(title, message, officerName, guild.name);

  // For a poll, create the event record and post the summary before sending.
  let pollEventId: string | null = null;
  if (draft.resultsChannelId !== null) {
    const event = await createPollEvent(draft, title);
    pollEventId = event.id;
  }

  // Sends one DM. Without a poll it is a plain embed.
  const sendOne = async (recipientId: string): Promise<void> => {
    if (pollEventId === null) {
      const user = await deps.client.users.fetch(recipientId);
      await user.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }
    // With a poll, the recipient joins it just before their DM so they can
    // answer straight away, and a failure is recorded at once, so a restart
    // mid-send leaves accurate counts (R5.13).
    await addPollRecipient(pollEventId, recipientId);
    try {
      const user = await deps.client.users.fetch(recipientId);
      await user.send({ embeds: [embed], components: [rsvpButtons(pollEventId)], allowedMentions: { parse: [] } });
    } catch (error) {
      await recordPollFailure(pollEventId, recipientId);
      throw error;
    }
  };

  // Progress edits stop working once the interaction token expires; that is
  // expected on long sends and ignored.
  const result = await deps.eventDm.startSend(draft, sendOne, (done, sendTotal) => {
    interaction
      .editReply({ embeds: [successEmbed("Sending…", `Progress: ${done}/${sendTotal}`)] })
      .catch(() => undefined);
  });

  // Refresh the poll summary through the usual debounce (R5.5).
  if (pollEventId !== null) {
    deps.poll.requestSummaryEdit(pollEventId);
  }

  // Log before replying, so an expired interaction can never skip the log.
  logSend(interaction, draft, title, message, result);
  await reportSummary(interaction, buildCompleteEmbed(result));
}

// Counts a confirmed send toward the sender's rolling rate limit. If they
// exceed it, blacklists them from /eventdm (persisted) and raises an @everyone
// alert in the log channel so administrators can review the misuse.
async function countTowardRateLimit(userId: string): Promise<void> {
  const deps = getEventDmDeps();
  const rate = deps.eventDm.recordSendAndCheck(userId);
  if (!rate.overLimit) {
    return;
  }
  await deps.settings.update((settings) => {
    if (!settings.eventDmBlacklist.includes(userId)) {
      settings.eventDmBlacklist.push(userId);
    }
  });
  if (deps.alertCommand) {
    deps.alertCommand(
      `<@${userId}> exceeded the /eventdm rate limit ` +
        `(${rate.count} sends within ${Math.round(LIMITS.eventDmRateWindowMs / 3_600_000)}h) ` +
        `and has been automatically blacklisted from the command. Review and remove from the ` +
        `blacklist if this was legitimate.`,
    );
  }
}

// Logs the send with full detail so a rule-breaking message can be traced.
// The title and message are officer-authored content, not secrets.
function logSend(
  interaction: ButtonInteraction,
  draft: PendingBroadcast,
  title: string,
  message: string,
  result: SendResult,
): void {
  const deps = getEventDmDeps();
  if (!deps.logCommand) {
    return;
  }
  deps.logCommand({
    commandName: "eventdm (sent)",
    runnerId: interaction.user.id,
    channelId: interaction.channelId ?? "unknown",
    detail: [
      `Role: ${draft.roleName} (${draft.roleId})`,
      `Recipients: ${result.sent} sent, ${result.failed.length} failed`,
      draft.resultsChannelId ? `Results channel: <#${draft.resultsChannelId}>` : "Poll: none",
      `Title: ${title}`,
      `Message: ${message}`,
    ],
  });
}

// Builds the "Event DM complete" embed: sent and failed counts plus the
// display names of failed recipients (truncated to fit).
function buildCompleteEmbed(result: SendResult): EmbedBuilder {
  const lines = [`Sent: ${result.sent}`, `Failed: ${result.failed.length}`];
  if (result.failed.length > 0) {
    const failedNames = result.failed.map((f) => f.name).join(", ");
    lines.push(`Failed recipients: ${truncate(failedNames, 1000)}`);
  }
  return successEmbed("Event DM complete", lines.join("\n"));
}

// Shows the final summary in the officer's reply. Discord refuses edits once
// the interaction is 15 minutes old, so a long send falls back to a DM.
async function reportSummary(interaction: ButtonInteraction, summary: EmbedBuilder): Promise<void> {
  try {
    await interaction.editReply({ embeds: [summary] });
    return;
  } catch {
    console.warn("[eventdm] Could not edit the reply (interaction likely expired); sending the summary by DM.");
  }
  try {
    await interaction.user.send({ embeds: [summary], allowedMentions: { parse: [] } });
  } catch {
    console.error("[eventdm] Could not DM the send summary to the officer.");
  }
}
