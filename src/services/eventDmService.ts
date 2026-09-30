// services/eventDmService.ts
// Holds pending event-DM previews, enforces a per-guild sending lock and
// 5-minute cooldown, and runs the send loop. Discord sending is injected so
// tests can fake it; a single failure never stops the loop.
import { randomUUID } from "crypto";
import { LIMITS } from "../config/constants";

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
  recipientIds: string[];
  displayNames: Record<string, string>;
  createdAt: number;
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
    draft: Omit<PendingBroadcast, "id" | "createdAt" | "recipientIds" | "displayNames" | "title" | "message">,
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
    });
    return id;
  }

  // Returns a pending broadcast if present and not expired.
  function get(id: string): PendingBroadcast | undefined {
    pruneExpired();
    return pending.get(id);
  }

  // Removes a pending broadcast (after confirm/cancel).
  function remove(id: string): void {
    pending.delete(id);
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

  // Checks whether a new broadcast may start in a guild (lock + cooldown).
  function canStart(guildId: string): { ok: true } | { ok: false; why: string } {
    const state = stateFor(guildId);
    if (state.sending) {
      return { ok: false, why: "A broadcast is already sending in this server." };
    }
    const sinceFinished = now() - state.lastFinishedAt;
    if (state.lastFinishedAt > 0 && sinceFinished < LIMITS.eventDmCooldownMs) {
      const waitMs = LIMITS.eventDmCooldownMs - sinceFinished;
      return { ok: false, why: `Please wait ${Math.ceil(waitMs / 1000)}s before the next broadcast.` };
    }
    return { ok: true };
  }

  // Runs the send loop: sends to each recipient with a pause, updates progress
  // at intervals, continues past failures, and returns the send result.
  async function startSend(
    broadcast: PendingBroadcast,
    sendOne: SendOne,
    onProgress: OnProgress,
  ): Promise<SendResult> {
    const state = stateFor(broadcast.guildId);
    state.sending = true;

    const result: SendResult = { sent: 0, failed: [] };
    const total = broadcast.recipientIds.length;
    try {
      for (let i = 0; i < broadcast.recipientIds.length; i++) {
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
    } finally {
      state.sending = false;
      state.lastFinishedAt = now();
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

  return { createDraft, get, remove, canStart, startSend, recordSendAndCheck };
}

export type EventDmService = ReturnType<typeof createEventDmService>;
