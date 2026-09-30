import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { createActivityTracker, type ActivityStore } from "./activityTracker";
import { createJsonFileStore } from "../storage/jsonFile";
import { defaultActivityFile, type ActivityFile } from "../storage/types";
import { LIMITS } from "../config/constants";

// A controllable clock.
function makeClock(start = 1_000_000) {
  let current = start;
  return { now: () => current, advance: (ms: number) => (current += ms) };
}

// An in-memory store that mimics the jsonFile store surface.
function memoryStore(initial: ActivityFile = defaultActivityFile()): ActivityStore & {
  saves: number;
} {
  let data = structuredClone(initial);
  let saves = 0;
  return {
    get: () => data,
    update: async (change) => {
      const draft = structuredClone(data);
      change(draft);
      data = draft;
      saves++;
    },
    get saves() {
      return saves;
    },
  } as ActivityStore & { saves: number };
}

describe("createActivityTracker", () => {
  test("records and reads a last-active timestamp", () => {
    const clock = makeClock();
    const tracker = createActivityTracker(memoryStore(), clock.now);
    tracker.record("u1");
    expect(tracker.getLastActive("u1")).toBe(clock.now());
  });

  test("returns 0 for an unknown user", () => {
    const tracker = createActivityTracker(memoryStore());
    expect(tracker.getLastActive("nobody")).toBe(0);
  });

  test("saveIfDue does nothing before the flush gap elapses", async () => {
    const clock = makeClock();
    const store = memoryStore();
    const tracker = createActivityTracker(store, clock.now);
    tracker.record("u1");
    await tracker.saveIfDue(); // first save allowed only after gap from lastSavedAt=0
    // lastSavedAt starts at 0 and clock is 1_000_000, so gap has elapsed: one save.
    const afterFirst = store.saves;
    tracker.record("u2");
    clock.advance(LIMITS.activityFlushGapMs - 1);
    await tracker.saveIfDue(); // too soon
    expect(store.saves).toBe(afterFirst);
  });

  test("saveIfDue saves once the flush gap has elapsed", async () => {
    const clock = makeClock();
    const store = memoryStore();
    const tracker = createActivityTracker(store, clock.now);
    tracker.record("u1");
    await tracker.saveIfDue();
    const afterFirst = store.saves;
    tracker.record("u2");
    clock.advance(LIMITS.activityFlushGapMs);
    await tracker.saveIfDue();
    expect(store.saves).toBe(afterFirst + 1);
  });

  test("saveNow does nothing when there are no changes", async () => {
    const store = memoryStore();
    const tracker = createActivityTracker(store);
    await tracker.saveNow();
    expect(store.saves).toBe(0);
  });

  test("prunes entries older than 90 days on save", async () => {
    const clock = makeClock();
    const old: ActivityFile = {
      version: 1,
      lastActive: { stale: clock.now() - LIMITS.activityMaxAgeMs - 1 },
    };
    const store = memoryStore(old);
    const tracker = createActivityTracker(store, clock.now);
    tracker.record("fresh");
    await tracker.saveNow();
    expect(tracker.getLastActive("stale")).toBe(0);
    expect(tracker.getLastActive("fresh")).toBe(clock.now());
  });

  test("caps the map at the maximum number of entries", async () => {
    const clock = makeClock();
    const store = memoryStore();
    const tracker = createActivityTracker(store, clock.now);
    for (let i = 0; i < LIMITS.activityMaxEntries + 50; i++) {
      clock.advance(1);
      tracker.record(`u${i}`);
    }
    await tracker.saveNow();
    // The oldest 50 should have been dropped; newest kept.
    expect(tracker.getLastActive("u0")).toBe(0);
    expect(tracker.getLastActive(`u${LIMITS.activityMaxEntries + 49}`)).toBeGreaterThan(0);
  });
});

describe("activity file corrupt-file fallback", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "activity-test-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("resets a corrupt activity file to empty", async () => {
    const filePath = path.join(dir, "activity.json");
    await fs.writeFile(filePath, "not json", "utf8");
    const store = await createJsonFileStore<ActivityFile>({
      filePath,
      defaults: defaultActivityFile,
      onCorrupt: "reset",
    });
    expect(store.get()).toEqual({ version: 1, lastActive: {} });
    // The bad file was preserved for inspection.
    expect(await fs.readFile(`${filePath}.corrupt`, "utf8")).toBe("not json");
  });
});
