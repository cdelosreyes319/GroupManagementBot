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

  test("records survive reopening the store", async () => {
    const filePath = path.join(dir, "events.json");
    const store = await createJsonEventStore(filePath);
    await store.upsert(makeEvent("a", Date.now()));
    const reopened = await createJsonEventStore(filePath);
    expect(reopened.get("a")?.title).toBe("Event a");
  });
});
