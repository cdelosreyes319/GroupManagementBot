// services/pollService.ts
// Records attendance RSVP answers, builds the summary shown in the results
// channel, and debounces summary edits so many quick answers cause at most one
// edit per 10 seconds. One debounce timer per active poll is the only timer the
// bot uses.
import { LIMITS } from "../config/constants";
import type { EventStore } from "../storage/eventStore";
import type { Answer, EventRecord } from "../storage/types";
import { truncate } from "../utils/text";

// The result of trying to record an answer.
export type RecordResult = "recorded" | "closed" | "not_a_recipient" | "unknown_event";

// The data needed to render the summary embed.
export type PollSummary = {
  counts: Record<Answer, number>;
  noAnswer: number;
  dmFailed: number;
  names: Record<Answer, string[]>;
};

// An injectable timer so tests can use fake timers.
export type TimerFns = {
  setTimeout: (fn: () => void, ms: number) => { unref?: () => void };
  clearTimeout: (handle: unknown) => void;
};

// The dependencies the poll service needs.
export type PollServiceDeps = {
  eventStore: EventStore;
  now?: () => number;
  timers?: TimerFns;
  // Called when a debounced edit fires; the caller edits the summary message.
  onSummaryEdit: (event: EventRecord) => Promise<void>;
};

// Builds the summary data from an event record (names capped per answer).
export function buildSummary(event: EventRecord): PollSummary {
  const counts: Record<Answer, number> = { yes: 0, maybe: 0, no: 0 };
  const names: Record<Answer, string[]> = { yes: [], maybe: [], no: [] };

  for (const [userId, answer] of Object.entries(event.answers)) {
    counts[answer]++;
    if (names[answer].length < LIMITS.pollNamesPerAnswer) {
      names[answer].push(event.displayNames[userId] ?? userId);
    }
  }

  const answered = Object.keys(event.answers).length;
  const noAnswer = Math.max(0, event.recipientIds.length - answered);
  return { counts, noAnswer, dmFailed: event.dmFailedCount, names };
}

// Formats one answer line for the summary embed: count + up to N names + "+M more".
export function formatAnswerLine(count: number, names: string[], total: number): string {
  if (count === 0) {
    return "0";
  }
  const shown = names.join(", ");
  const remaining = total - names.length;
  const suffix = remaining > 0 ? ` +${remaining} more` : "";
  return `${count} — ${truncate(shown + suffix, 1000)}`;
}

// Builds the poll service.
export function createPollService(deps: PollServiceDeps) {
  const now = deps.now ?? Date.now;
  const timers = deps.timers ?? {
    setTimeout: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      handle.unref?.();
      return handle;
    },
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };

  // One pending edit timer per event ID.
  const editTimers = new Map<string, unknown>();

  // Records an answer, replacing any earlier one. Persists to the event store.
  async function recordAnswer(
    eventId: string,
    userId: string,
    answer: Answer,
  ): Promise<RecordResult> {
    const event = deps.eventStore.get(eventId);
    if (!event) {
      return "unknown_event";
    }
    if (now() >= event.closesAt) {
      return "closed";
    }
    if (!event.recipientIds.includes(userId)) {
      return "not_a_recipient";
    }
    const updated: EventRecord = { ...event, answers: { ...event.answers, [userId]: answer } };
    await deps.eventStore.upsert(updated);
    return "recorded";
  }

  // Requests a debounced summary edit: if a timer already exists for this event,
  // do nothing; otherwise schedule one edit up to 10 seconds out.
  function requestSummaryEdit(eventId: string): void {
    if (editTimers.has(eventId)) {
      return;
    }
    const handle = timers.setTimeout(() => {
      editTimers.delete(eventId);
      const event = deps.eventStore.get(eventId);
      if (!event) {
        return;
      }
      deps.onSummaryEdit(event).catch(() => {
        // A missing summary message is logged by the caller and ignored here.
      });
    }, LIMITS.pollSummaryEditGapMs);
    handle.unref?.();
    editTimers.set(eventId, handle);
  }

  return { recordAnswer, requestSummaryEdit, buildSummary };
}

export type PollService = ReturnType<typeof createPollService>;
