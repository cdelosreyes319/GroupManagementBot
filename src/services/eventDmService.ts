// services/eventDmService.ts
// Holds pending event-DM previews, enforces a per-guild sending lock and
// 5-minute cooldown, and runs the send loop. Discord sending is injected so
// tests can fake it; a single failure never stops the loop.
//
// Claiming a send (claimSend) is synchronous on purpose: the caller claims
// before its first await, so a double-click or a second officer's Confirm that
// arrives a moment later always sees the claim.
import { randomUUID } from "crypto";
import { LIMITS } from "../config/constants";

// Where a draft is in its life: waiting for a button, or already used.
export type DraftStatus = "open" | "confirmed" | "cancelled";

// The answer to "may this happen?": yes, or no with a reason for the officer.
export type Outcome = { ok: true } | { ok: false; why: string };

// A draft broadcast created by /eventdm, completed by the modal, confirmed by a
// button. Only IDs and display names are stored, never member objects.
export type PendingBroadcast = {
  id: string;
  requesterId: string;
  guildId: string;
  roleId: string;
  roleName: string;
  limit: number;
  resultsChannelId: string | null;
  title: string | null;
  message: string | null;
  // The officer's server display name, captured at modal submit (R4.13).
  requesterName: string | null;
  recipientIds: string[];
  displayNames: Record<string, string>;
  createdAt: number;
  // Confirmed and cancelled drafts stay until they expire, so a late second
  // button press is told what happened instead of acting twice.
  status: DraftStatus;
};

// One send failure (recipient ID + display name).
export type SendFailure = { id: string; name: string };

// The result of a send run.
export type SendResult = { sent: number; failed: SendFailure[] };

// Sends one DM to a recipient; injected so tests can fake Discord.
export type SendOne = (recipientId: string) => Promise<void>;

// Called at intervals with progress (sent + failed so far, total).
export type OnProgress = (done: number, total: number) => void;

// Per-guild sending state for the lock and cooldown.
type GuildState = { sending: boolean; lastFinishedAt: number };

// Reports whether sending to this many recipients (each DM's own time plus
// the pause between DMs) will take longer than the officer's reply can still
// be edited.
export function sendOutlivesReply(recipientCount: number): boolean {
  const estimatedMs = recipientCount * (LIMITS.eventDmDelayMs + LIMITS.eventDmEstimatedSendMs);
  return estimatedMs > LIMITS.eventDmReplyWindowMs;
}

// Builds the event-DM service with an injectable clock and sleep function.
export function createEventDmService(
  now: () => number = Date.now,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  const pending = new Map<string, PendingBroadcast>();
  const guildStates = new Map<string, GuildState>();
  // Per-user confirmed-send timestamps, for the rolling rate limit.
  const sendTimestamps = new Map<string, number[]>();

  // Removes expired previews whenever the map is touched.
  function pruneExpired(): void {
    const cutoff = now() - LIMITS.eventDmPreviewTtlMs;
    for (const [id, broadcast] of pending) {
      if (broadcast.createdAt < cutoff) {
        pending.delete(id);
      }
    }
  }

  // Stores a new draft broadcast and returns its short ID.
  function createDraft(
    draft: Omit<PendingBroadcast, "id" | "createdAt" | "recipientIds" | "displayNames" | "title" | "message" | "requesterName" | "status">,
  ): string {
    pruneExpired();
    // Keep the map bounded.
    if (pending.size >= LIMITS.pollMaxStored) {
      const oldest = [...pending.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) {
        pending.delete(oldest[0]);
      }
    }
    const id = randomUUID().slice(0, 8);
    pending.set(id, {
      ...draft,
      id,
      createdAt: now(),
      recipientIds: [],
      displayNames: {},
      title: null,
      message: null,
      requesterName: null,
      status: "open",
    });
    return id;
  }

  // Returns a pending broadcast if present and not expired.
  function get(id: string): PendingBroadcast | undefined {
    pruneExpired();
    return pending.get(id);
  }

  // Returns the guild's state, creating a default entry if needed.
  function stateFor(guildId: string): GuildState {
    let state = guildStates.get(guildId);
    if (!state) {
      state = { sending: false, lastFinishedAt: 0 };
      guildStates.set(guildId, state);
    }
    return state;
  }

  // Explains why a draft that is no longer open cannot be used again.
  function alreadyUsed(draft: PendingBroadcast): Outcome {
    if (draft.status === "confirmed") {
      return { ok: false, why: "This broadcast was already confirmed." };
    }
    return { ok: false, why: "This broadcast was already cancelled." };
  }

  // Claims the guild's sending lock for a draft and marks it confirmed, or
  // explains why not (draft already used, a send in progress, or cooldown).
  // Every successful claim must be paired with finishSend (after sending) or
  // releaseClaim (if nothing was sent).
  function claimSend(draft: PendingBroadcast): Outcome {
    if (draft.status !== "open") {
      return alreadyUsed(draft);
    }
    const state = stateFor(draft.guildId);
    if (state.sending) {
      return { ok: false, why: "A broadcast is already sending in this server." };
    }
    const sinceFinished = now() - state.lastFinishedAt;
    if (state.lastFinishedAt > 0 && sinceFinished < LIMITS.eventDmCooldownMs) {
      const waitMs = LIMITS.eventDmCooldownMs - sinceFinished;
      return { ok: false, why: `Please wait ${Math.ceil(waitMs / 1000)}s before the next broadcast.` };
    }
    state.sending = true;
    draft.status = "confirmed";
    return { ok: true };
  }

  // Releases the guild's sending lock without a cooldown, for a claim that
  // failed before any DM was sent.
  function releaseClaim(guildId: string): void {
    stateFor(guildId).sending = false;
  }

  // Releases the guild's sending lock and starts the cooldown.
  function finishSend(guildId: string): void {
    const state = stateFor(guildId);
    state.sending = false;
    state.lastFinishedAt = now();
  }

  // Marks an open draft cancelled, or explains why it is no longer open.
  function cancel(draft: PendingBroadcast): Outcome {
    if (draft.status !== "open") {
      return alreadyUsed(draft);
    }
    draft.status = "cancelled";
    return { ok: true };
  }

  // Runs the send loop: sends to each recipient with a pause, updates progress
  // at intervals, continues past failures, and returns the send result. The
  // caller holds the lock (claimSend) and releases it (finishSend).
  async function startSend(
    broadcast: PendingBroadcast,
    sendOne: SendOne,
    onProgress: OnProgress,
  ): Promise<SendResult> {
    const result: SendResult = { sent: 0, failed: [] };
    const total = broadcast.recipientIds.length;
    for (let i = 0; i < total; i++) {
      const recipientId = broadcast.recipientIds[i];
      try {
        await sendOne(recipientId);
        result.sent++;
      } catch {
        result.failed.push({ id: recipientId, name: broadcast.displayNames[recipientId] ?? recipientId });
      }
      const done = i + 1;
      if (done % LIMITS.eventDmProgressEvery === 0 || done === total) {
        onProgress(done, total);
      }
      if (done < total) {
        await sleepFn(LIMITS.eventDmDelayMs);
      }
    }
    return result;
  }

  // Records a confirmed send by a user and reports whether they have now
  // exceeded the rolling per-user rate limit. Timestamps older than the window
  // are pruned; the map is bounded by pruning empty entries.
  function recordSendAndCheck(userId: string): { overLimit: boolean; count: number } {
    const cutoff = now() - LIMITS.eventDmRateWindowMs;
    const recent = (sendTimestamps.get(userId) ?? []).filter((t) => t > cutoff);
    recent.push(now());
    sendTimestamps.set(userId, recent);
    // Keep the map from growing without bound: drop other users' stale entries.
    for (const [id, times] of sendTimestamps) {
      if (id !== userId && times.every((t) => t <= cutoff)) {
        sendTimestamps.delete(id);
      }
    }
    return { overLimit: recent.length > LIMITS.eventDmMaxPerDay, count: recent.length };
  }

  return { createDraft, get, claimSend, releaseClaim, finishSend, cancel, startSend, recordSendAndCheck };
}

export type EventDmService = ReturnType<typeof createEventDmService>;
