import { describe, test, expect, vi } from "vitest";
import { createPollService, buildSummary, formatAnswerLine } from "./pollService";
import type { EventStore } from "../storage/eventStore";
import type { EventRecord } from "../storage/types";
import { LIMITS } from "../config/constants";

// Builds an event record with recipients and answers.
function makeEvent(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "e1",
    title: "Event",
    guildId: "g1",
    createdBy: "officer",
    createdAt: 0,
    closesAt: 1_000_000,
    resultsChannelId: "c1",
    summaryMessageId: "m1",
    recipientIds: ["a", "b", "c"],
    displayNames: { a: "Alice", b: "Bob", c: "Cara" },
    dmFailedCount: 0,
    answers: {},
    ...over,
  };
}

// A fake event store backed by a single mutable record.
function fakeStore(initial: EventRecord): EventStore & { current: EventRecord } {
  let current = initial;
  return {
    get: (id) => (id === current.id ? current : undefined),
    all: () => [current],
    upsert: async (record) => {
      current = record;
    },
    get current() {
      return current;
    },
  } as EventStore & { current: EventRecord };
}

// A fake clock.
function makeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("recordAnswer", () => {
  test("records an answer and replaces an earlier one", async () => {
    const store = fakeStore(makeEvent());
    const service = createPollService({ eventStore: store, now: () => 0, onSummaryEdit: async () => {} });
    expect(await service.recordAnswer("e1", "a", "yes")).toBe("recorded");
    expect(store.current.answers.a).toBe("yes");
    expect(await service.recordAnswer("e1", "a", "no")).toBe("recorded");
    expect(store.current.answers.a).toBe("no");
  });

  test("returns closed after the poll closes", async () => {
    const clock = makeClock();
    const store = fakeStore(makeEvent({ closesAt: 100 }));
    const service = createPollService({ eventStore: store, now: clock.now, onSummaryEdit: async () => {} });
    clock.advance(100);
    expect(await service.recordAnswer("e1", "a", "yes")).toBe("closed");
  });

  test("ignores a non-recipient", async () => {
    const store = fakeStore(makeEvent());
    const service = createPollService({ eventStore: store, now: () => 0, onSummaryEdit: async () => {} });
    expect(await service.recordAnswer("e1", "stranger", "yes")).toBe("not_a_recipient");
  });

  test("returns unknown_event for a missing event", async () => {
    const store = fakeStore(makeEvent());
    const service = createPollService({ eventStore: store, now: () => 0, onSummaryEdit: async () => {} });
    expect(await service.recordAnswer("missing", "a", "yes")).toBe("unknown_event");
  });
});

describe("buildSummary", () => {
  test("counts answers and no-answer", () => {
    const event = makeEvent({ answers: { a: "yes", b: "no" } });
    const summary = buildSummary(event);
    expect(summary.counts).toEqual({ yes: 1, maybe: 0, no: 1 });
    expect(summary.noAnswer).toBe(1); // c has not answered
  });

  test("includes dmFailed count", () => {
    const summary = buildSummary(makeEvent({ dmFailedCount: 3 }));
    expect(summary.dmFailed).toBe(3);
  });

  test("caps names per answer at the limit", () => {
    const recipientIds: string[] = [];
    const displayNames: Record<string, string> = {};
    const answers: Record<string, "yes"> = {};
    for (let i = 0; i < LIMITS.pollNamesPerAnswer + 5; i++) {
      const id = `u${i}`;
      recipientIds.push(id);
      displayNames[id] = `User${i}`;
      answers[id] = "yes";
    }
    const summary = buildSummary(makeEvent({ recipientIds, displayNames, answers }));
    expect(summary.counts.yes).toBe(LIMITS.pollNamesPerAnswer + 5);
    expect(summary.names.yes).toHaveLength(LIMITS.pollNamesPerAnswer);
  });
});

describe("formatAnswerLine", () => {
  test("shows 0 for no answers", () => {
    expect(formatAnswerLine(0, [], 0)).toBe("0");
  });

  test("adds a +N more suffix when names are truncated", () => {
    expect(formatAnswerLine(25, ["A", "B"], 25)).toContain("+23 more");
  });

  test("no suffix when all names shown", () => {
    expect(formatAnswerLine(2, ["A", "B"], 2)).not.toContain("more");
  });
});

describe("requestSummaryEdit debounce", () => {
  test("collapses many requests into one edit and does not throw on missing message", async () => {
    vi.useFakeTimers();
    try {
      const store = fakeStore(makeEvent());
      const onSummaryEdit = vi.fn(async () => {});
      const service = createPollService({
        eventStore: store,
        now: () => 0,
        timers: {
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
        },
        onSummaryEdit,
      });

      // Many rapid requests -> only one timer scheduled.
      for (let i = 0; i < 10; i++) {
        service.requestSummaryEdit("e1");
      }
      await vi.advanceTimersByTimeAsync(LIMITS.pollSummaryEditGapMs + 1);
      expect(onSummaryEdit).toHaveBeenCalledTimes(1);

      // After firing, a new request schedules a fresh edit.
      service.requestSummaryEdit("e1");
      await vi.advanceTimersByTimeAsync(LIMITS.pollSummaryEditGapMs + 1);
      expect(onSummaryEdit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a failing onSummaryEdit does not throw", async () => {
    vi.useFakeTimers();
    try {
      const store = fakeStore(makeEvent());
      const onSummaryEdit = vi.fn(async () => {
        throw new Error("summary message deleted");
      });
      const service = createPollService({
        eventStore: store,
        now: () => 0,
        timers: {
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
        },
        onSummaryEdit,
      });
      service.requestSummaryEdit("e1");
      await expect(vi.advanceTimersByTimeAsync(LIMITS.pollSummaryEditGapMs + 1)).resolves.not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
