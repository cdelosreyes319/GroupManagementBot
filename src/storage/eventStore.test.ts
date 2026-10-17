import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { createJsonEventStore } from "./eventStore";
import type { EventRecord } from "./types";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "events-test-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

// Builds an event record with sensible defaults.
function makeEvent(id: string, createdAt: number): EventRecord {
  return {
    id,
    title: `Event ${id}`,
    guildId: "g1",
    createdBy: "officer",
    createdAt,
    closesAt: createdAt + 1000,
    resultsChannelId: "c1",
    summaryMessageId: null,
    recipientIds: [],
    displayNames: {},
    dmFailedCount: 0,
    answers: {},
  };
}

describe("createJsonEventStore", () => {
  test("starts empty and upserts a record", async () => {
    const store = await createJsonEventStore(path.join(dir, "events.json"));
    await store.upsert(makeEvent("a", Date.now()));
    expect(store.get("a")?.title).toBe("Event a");
    expect(store.all()).toHaveLength(1);
  });

  test("upsert replaces an existing record by id", async () => {
    const store = await createJsonEventStore(path.join(dir, "events.json"));
    const createdAt = Date.now();
    await store.upsert(makeEvent("a", createdAt));
    const updated = makeEvent("a", createdAt);
    updated.title = "Changed";
    await store.upsert(updated);
    expect(store.all()).toHaveLength(1);
    expect(store.get("a")?.title).toBe("Changed");
  });

  test("prunes records older than 30 days", async () => {
    const now = 100 * 24 * 60 * 60_000; // 100 days
    const store = await createJsonEventStore(path.join(dir, "events.json"), () => now);
    await store.upsert(makeEvent("old", 0)); // 100 days old -> pruned
    await store.upsert(makeEvent("new", now - 1000)); // recent -> kept
    expect(store.get("old")).toBeUndefined();
    expect(store.get("new")).toBeDefined();
  });

  test("keeps at most 20 records", async () => {
    const store = await createJsonEventStore(path.join(dir, "events.json"), () => 1_000_000);
    for (let i = 0; i < 25; i++) {
      await store.upsert(makeEvent(`e${i}`, 1_000_000 - i));
    }
    expect(store.all()).toHaveLength(20);
  });

  test("prunes closed polls before open ones when over the cap", async () => {
    const now = 1_000_000;
    const store = await createJsonEventStore(path.join(dir, "events.json"), () => now);
    // The oldest poll is still open (closes in the future); five newer ones are closed.
    await store.upsert({ ...makeEvent("open-oldest", now - 100), closesAt: now + 60_000 });
    for (let i = 0; i < 5; i++) {
      await store.upsert({ ...makeEvent(`closed${i}`, now - 90 + i), closesAt: now - 1 });
    }
    for (let i = 0; i < 15; i++) {
      await store.upsert({ ...makeEvent(`open${i}`, now - 50 + i), closesAt: now + 60_000 });
    }
    // 21 records: one must go, and it must be the oldest closed poll.
    expect(store.all()).toHaveLength(20);
    expect(store.get("open-oldest")).toBeDefined();
    expect(store.get("closed0")).toBeUndefined();
    expect(store.get("closed1")).toBeDefined();
  });

  test("drops the oldest open poll when every poll is open", async () => {
    const now = 1_000_000;
    const store = await createJsonEventStore(path.join(dir, "events.json"), () => now);
    for (let i = 0; i < 21; i++) {
      await store.upsert({ ...makeEvent(`open${i}`, now - 100 + i), closesAt: now + 60_000 });
    }
    expect(store.all()).toHaveLength(20);
    expect(store.get("open0")).toBeUndefined();
    expect(store.get("open20")).toBeDefined();
  });

  test("update changes the stored record in place", async () => {
    const store = await createJsonEventStore(path.join(dir, "events.json"));
    await store.upsert(makeEvent("a", Date.now()));
    await store.update("a", (record) => {
      record.answers.u1 = "yes";
    });
    expect(store.get("a")?.answers).toEqual({ u1: "yes" });
  });

  test("concurrent updates to different fields both survive", async () => {
    const store = await createJsonEventStore(path.join(dir, "events.json"));
    await store.upsert(makeEvent("a", Date.now()));
    // An answer arriving while the send loop records its results (the bug
    // where saving a stale copy erased answers given during a broadcast).
    await Promise.all([
      store.update("a", (record) => {
        record.answers.u1 = "maybe";
      }),
      store.update("a", (record) => {
        record.dmFailedCount = 2;
      }),
    ]);
    expect(store.get("a")?.answers).toEqual({ u1: "maybe" });
    expect(store.get("a")?.dmFailedCount).toBe(2);
  });

  test("update of an unknown id changes nothing", async () => {
    const store = await createJsonEventStore(path.join(dir, "events.json"));
    await store.upsert(makeEvent("a", Date.now()));
    await store.update("missing", (record) => {
      record.title = "Changed";
    });
    expect(store.all()).toHaveLength(1);
    expect(store.get("a")?.title).toBe("Event a");
  });

  test("records survive reopening the store", async () => {
    const filePath = path.join(dir, "events.json");
    const store = await createJsonEventStore(filePath);
    await store.upsert(makeEvent("a", Date.now()));
    const reopened = await createJsonEventStore(filePath);
    expect(reopened.get("a")?.title).toBe("Event a");
  });
});
