// storage/eventStore.ts
// Stores event/poll records so RSVP buttons keep working across restarts.
// Prunes to at most 20 records (closed polls go first) and drops any older
// than 30 days.
import { createJsonFileStore } from "./jsonFile";
import { dataFilePath } from "./paths";
import { LIMITS } from "../config/constants";
import { defaultEventFile, type EventFile, type EventRecord } from "./types";

// The event store surface used by the poll and event-DM services.
export interface EventStore {
  get(id: string): EventRecord | undefined;
  all(): readonly EventRecord[];
  upsert(record: EventRecord): Promise<void>;
  update(id: string, change: (record: EventRecord) => void): Promise<void>;
}

// Removes events older than 30 days, then cuts down to 20. Closed polls are
// dropped before open ones, so busy weeks never close a poll early; only when
// every poll is open does the oldest open one go.
function prune(events: EventRecord[], now: number): EventRecord[] {
  const recent = events.filter((event) => now - event.createdAt <= LIMITS.pollMaxAgeMs);
  let excess = recent.length - LIMITS.pollMaxStored;
  if (excess <= 0) {
    return recent;
  }

  // Events are kept oldest-first, so each pass drops the oldest match first.
  const dropped = new Set<string>();
  for (const event of recent) {
    if (excess > 0 && event.closesAt <= now) {
      dropped.add(event.id);
      excess--;
    }
  }
  for (const event of recent) {
    if (excess > 0 && !dropped.has(event.id)) {
      dropped.add(event.id);
      excess--;
    }
  }
  return recent.filter((event) => !dropped.has(event.id));
}

// Creates a JSON-backed event store. A corrupt events.json refuses to start.
export async function createJsonEventStore(
  filePath: string = dataFilePath("events.json"),
  now: () => number = Date.now,
): Promise<EventStore> {
  const store = await createJsonFileStore<EventFile>({
    filePath,
    defaults: defaultEventFile,
    onCorrupt: "refuse",
  });

  function get(id: string): EventRecord | undefined {
    return store.get().events.find((event) => event.id === id);
  }

  function all(): readonly EventRecord[] {
    return store.get().events;
  }

  // Inserts a new record or replaces an existing one by id, then prunes.
  async function upsert(record: EventRecord): Promise<void> {
    await store.update((draft) => {
      const index = draft.events.findIndex((event) => event.id === record.id);
      if (index >= 0) {
        draft.events[index] = record;
      } else {
        draft.events.push(record);
      }
      draft.events = prune(draft.events, now());
    });
  }

  // Changes one stored record in place. The change runs against the latest
  // saved copy inside the file's write queue, so two callers editing the same
  // event (an RSVP and the send loop) never overwrite each other. An unknown
  // id is ignored.
  async function update(id: string, change: (record: EventRecord) => void): Promise<void> {
    await store.update((draft) => {
      const record = draft.events.find((event) => event.id === id);
      if (record) {
        change(record);
      }
    });
  }

  return { get, all, upsert, update };
}
