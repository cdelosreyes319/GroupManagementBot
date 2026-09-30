import { describe, test, expect, vi } from "vitest";
import { createEventDmService, type PendingBroadcast } from "./eventDmService";
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

  test("remove deletes a draft", () => {
    const service = createEventDmService();
    const id = service.createDraft({
      requesterId: "officer",
      guildId: "g1",
      roleId: "r1",
      roleName: "Role",
      limit: 250,
      resultsChannelId: null,
    });
    service.remove(id);
    expect(service.get(id)).toBeUndefined();
  });
});

describe("lock and cooldown", () => {
  test("refuses a second broadcast while one is sending", async () => {
    const clock = makeClock();
    const service = createEventDmService(clock.now, noSleep);
    // Start a send that we can inspect mid-flight via canStart during the loop.
    let checkedDuringSend: { ok: boolean } | null = null;
    const sendOne = vi.fn(async () => {
      checkedDuringSend = service.canStart("g1");
    });
    await service.startSend(broadcast(), sendOne, () => {});
    expect(checkedDuringSend).toEqual({ ok: false, why: expect.any(String) });
  });

  test("applies a cooldown after finishing", async () => {
    const clock = makeClock();
    const service = createEventDmService(clock.now, noSleep);
    await service.startSend(broadcast(), async () => {}, () => {});
    // Immediately after: cooldown active.
    expect(service.canStart("g1").ok).toBe(false);
    clock.advance(LIMITS.eventDmCooldownMs);
    expect(service.canStart("g1").ok).toBe(true);
  });

  test("canStart is ok initially", () => {
    const service = createEventDmService();
    expect(service.canStart("fresh").ok).toBe(true);
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
