import { describe, test, expect, vi } from "vitest";
import { createEventDmService, sendOutlivesReply, type PendingBroadcast } from "./eventDmService";
import { LIMITS } from "../config/constants";

function makeClock(start = 1_000_000) {
  let current = start;
  return { now: () => current, advance: (ms: number) => (current += ms) };
}

// A no-op sleep so the send loop runs instantly in tests.
const noSleep = async () => undefined;

// Builds a broadcast with recipients.
function broadcast(over: Partial<PendingBroadcast> = {}): PendingBroadcast {
  return {
    id: "b1",
    requesterId: "officer",
    guildId: "g1",
    roleId: "r1",
    roleName: "Role",
    limit: 250,
    resultsChannelId: null,
    title: "Title",
    message: "Message",
    requesterName: "Officer",
    status: "open",
    recipientIds: ["a", "b", "c"],
    displayNames: { a: "Alice", b: "Bob", c: "Cara" },
    createdAt: 0,
    ...over,
  };
}

describe("draft lifecycle", () => {
  test("createDraft then get returns the draft", () => {
    const service = createEventDmService();
    const id = service.createDraft({
      requesterId: "officer",
      guildId: "g1",
      roleId: "r1",
      roleName: "Role",
      limit: 250,
      resultsChannelId: null,
    });
    expect(service.get(id)?.requesterId).toBe("officer");
  });

  test("a draft expires after the preview TTL", () => {
    const clock = makeClock();
    const service = createEventDmService(clock.now);
    const id = service.createDraft({
      requesterId: "officer",
      guildId: "g1",
      roleId: "r1",
      roleName: "Role",
      limit: 250,
      resultsChannelId: null,
    });
    clock.advance(LIMITS.eventDmPreviewTtlMs + 1);
    expect(service.get(id)).toBeUndefined();
  });

  test("a new draft starts open", () => {
    const service = createEventDmService();
    const id = service.createDraft({
      requesterId: "officer",
      guildId: "g1",
      roleId: "r1",
      roleName: "Role",
      limit: 250,
      resultsChannelId: null,
    });
    expect(service.get(id)?.status).toBe("open");
  });
});

describe("claimSend", () => {
  test("claims an open draft and marks it confirmed", () => {
    const service = createEventDmService(makeClock().now);
    const draft = broadcast();
    expect(service.claimSend(draft)).toEqual({ ok: true });
    expect(draft.status).toBe("confirmed");
  });

  test("refuses a second claim of the same draft (double-click on Confirm)", () => {
    const service = createEventDmService(makeClock().now);
    const draft = broadcast();
    service.claimSend(draft);
    expect(service.claimSend(draft)).toEqual({ ok: false, why: expect.stringContaining("already") });
  });

  test("refuses a cancelled draft", () => {
    const service = createEventDmService(makeClock().now);
    const draft = broadcast();
    service.cancel(draft);
    expect(service.claimSend(draft).ok).toBe(false);
  });

  test("refuses another officer's draft while one is sending, and leaves it open", () => {
    const service = createEventDmService(makeClock().now);
    service.claimSend(broadcast({ id: "first" }));
    const second = broadcast({ id: "second", requesterId: "other" });
    expect(service.claimSend(second)).toEqual({ ok: false, why: expect.stringContaining("already sending") });
    expect(second.status).toBe("open");
  });

  test("applies the cooldown after finishSend", () => {
    const clock = makeClock();
    const service = createEventDmService(clock.now);
    service.claimSend(broadcast({ id: "first" }));
    service.finishSend("g1");
    expect(service.claimSend(broadcast({ id: "second" }))).toEqual({
      ok: false,
      why: expect.stringContaining("Please wait"),
    });
    clock.advance(LIMITS.eventDmCooldownMs);
    expect(service.claimSend(broadcast({ id: "third" })).ok).toBe(true);
  });

  test("releaseClaim unlocks without starting the cooldown", () => {
    const service = createEventDmService(makeClock().now);
    service.claimSend(broadcast({ id: "first" }));
    service.releaseClaim("g1");
    expect(service.claimSend(broadcast({ id: "second" }))).toEqual({ ok: true });
  });

  test("locks per server, not globally", () => {
    const service = createEventDmService(makeClock().now);
    service.claimSend(broadcast({ id: "first", guildId: "g1" }));
    expect(service.claimSend(broadcast({ id: "second", guildId: "g2" })).ok).toBe(true);
  });
});

describe("cancel", () => {
  test("cancels an open draft", () => {
    const service = createEventDmService();
    const draft = broadcast();
    expect(service.cancel(draft)).toEqual({ ok: true });
    expect(draft.status).toBe("cancelled");
  });

  test("refuses to cancel a draft that is already confirmed", () => {
    const service = createEventDmService(makeClock().now);
    const draft = broadcast();
    service.claimSend(draft);
    expect(service.cancel(draft)).toEqual({ ok: false, why: expect.stringContaining("already") });
    expect(draft.status).toBe("confirmed");
  });
});

describe("startSend", () => {
  test("sends to every recipient and reports counts", async () => {
    const service = createEventDmService(makeClock().now, noSleep);
    const sendOne = vi.fn(async () => {});
    const result = await service.startSend(broadcast(), sendOne, () => {});
    expect(result.sent).toBe(3);
    expect(result.failed).toEqual([]);
    expect(sendOne).toHaveBeenCalledTimes(3);
  });

  test("continues past a failure and records it with the display name", async () => {
    const service = createEventDmService(makeClock().now, noSleep);
    const sendOne = vi.fn(async (id: string) => {
      if (id === "b") {
        throw new Error("DMs closed");
      }
    });
    const result = await service.startSend(broadcast(), sendOne, () => {});
    expect(result.sent).toBe(2);
    expect(result.failed).toEqual([{ id: "b", name: "Bob" }]);
  });

  test("reports final progress", async () => {
    const service = createEventDmService(makeClock().now, noSleep);
    const onProgress = vi.fn();
    await service.startSend(broadcast(), async () => {}, onProgress);
    // Final progress call is (total, total).
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  test("handles zero recipients", async () => {
    const service = createEventDmService(makeClock().now, noSleep);
    const result = await service.startSend(
      broadcast({ recipientIds: [], displayNames: {} }),
      async () => {},
      () => {},
    );
    expect(result).toEqual({ sent: 0, failed: [] });
  });
});

describe("per-user rate limit", () => {
  test("stays under the limit up to the maximum, then trips on the next send", () => {
    const service = createEventDmService(makeClock().now);
    // The first eventDmMaxPerDay sends are allowed.
    for (let i = 1; i <= LIMITS.eventDmMaxPerDay; i++) {
      const r = service.recordSendAndCheck("officer");
      expect(r.count).toBe(i);
      expect(r.overLimit).toBe(false);
    }
    // The next send crosses the limit.
    const tripped = service.recordSendAndCheck("officer");
    expect(tripped.count).toBe(LIMITS.eventDmMaxPerDay + 1);
    expect(tripped.overLimit).toBe(true);
  });

  test("tracks each user independently", () => {
    const service = createEventDmService(makeClock().now);
    for (let i = 0; i < LIMITS.eventDmMaxPerDay; i++) {
      service.recordSendAndCheck("a");
    }
    // A different user is unaffected by user a's sends.
    expect(service.recordSendAndCheck("b").overLimit).toBe(false);
  });

  test("forgets sends older than the rolling window", () => {
    const clock = makeClock();
    const service = createEventDmService(clock.now);
    for (let i = 0; i < LIMITS.eventDmMaxPerDay; i++) {
      service.recordSendAndCheck("officer");
    }
    // After the window passes, the earlier sends no longer count.
    clock.advance(LIMITS.eventDmRateWindowMs + 1);
    const r = service.recordSendAndCheck("officer");
    expect(r.count).toBe(1);
    expect(r.overLimit).toBe(false);
  });
});

describe("sendOutlivesReply", () => {
  test("a small send finishes inside the reply window", () => {
    expect(sendOutlivesReply(10)).toBe(false);
  });

  test("a send at the recipient cap outlives the reply window", () => {
    expect(sendOutlivesReply(LIMITS.eventDmMaxRecipients)).toBe(true);
  });

  test("the boundary counts the pause and the time each DM takes", () => {
    const perDmMs = LIMITS.eventDmDelayMs + LIMITS.eventDmEstimatedSendMs;
    const fitting = Math.floor(LIMITS.eventDmReplyWindowMs / perDmMs);
    expect(sendOutlivesReply(fitting)).toBe(false);
    expect(sendOutlivesReply(fitting + 1)).toBe(true);
  });
});
