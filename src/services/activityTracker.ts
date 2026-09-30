// services/activityTracker.ts
// Tracks the last time each member was active (message, voice, or command).
// Data lives in memory as a Map and is saved to activity.json at most once
// every 5 minutes, with no repeating timer. Message content is never stored.
import { LIMITS } from "../config/constants";
import type { ActivityFile } from "../storage/types";

// The tracker surface used by the client and the recipient selector.
export interface ActivityTracker {
  record(userId: string): void;
  getLastActive(userId: string): number;
  saveIfDue(): Promise<void>;
  saveNow(): Promise<void>;
}

// The storage the tracker writes through (a jsonFile store over activity.json).
export type ActivityStore = {
  get(): Readonly<ActivityFile>;
  update(change: (draft: ActivityFile) => void): Promise<void>;
};

// Builds the activity tracker over a store, with an injectable clock.
export function createActivityTracker(
  store: ActivityStore,
  now: () => number = Date.now,
): ActivityTracker {
  // In-memory map seeded from the loaded file.
  const lastActive = new Map<string, number>(Object.entries(store.get().lastActive));
  let changed = false;
  let lastSavedAt = 0;

  // Records the current time as a member's last activity (memory only).
  function record(userId: string): void {
    lastActive.set(userId, now());
    changed = true;
  }

  // Returns the member's last-active timestamp, or 0 when unknown.
  function getLastActive(userId: string): number {
    return lastActive.get(userId) ?? 0;
  }

  // Drops entries older than 90 days, then caps the map at 5000 newest entries.
  function prune(): void {
    const cutoff = now() - LIMITS.activityMaxAgeMs;
    for (const [userId, timestamp] of lastActive) {
      if (timestamp < cutoff) {
        lastActive.delete(userId);
      }
    }
    if (lastActive.size > LIMITS.activityMaxEntries) {
      const sorted = [...lastActive.entries()].sort((a, b) => b[1] - a[1]);
      lastActive.clear();
      for (const [userId, timestamp] of sorted.slice(0, LIMITS.activityMaxEntries)) {
        lastActive.set(userId, timestamp);
      }
    }
  }

  // Writes the current map to the store after pruning.
  async function save(): Promise<void> {
    prune();
    const snapshot = Object.fromEntries(lastActive);
    await store.update((draft) => {
      draft.lastActive = snapshot;
    });
    changed = false;
    lastSavedAt = now();
  }

  // Saves only if there are unsaved changes and 5 minutes have passed.
  async function saveIfDue(): Promise<void> {
    if (!changed) {
      return;
    }
    if (now() - lastSavedAt < LIMITS.activityFlushGapMs) {
      return;
    }
    await save();
  }

  // Saves immediately (used on shutdown).
  async function saveNow(): Promise<void> {
    if (!changed) {
      return;
    }
    await save();
  }

  return { record, getLastActive, saveIfDue, saveNow };
}
