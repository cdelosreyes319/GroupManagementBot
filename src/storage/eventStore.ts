// storage/eventStore.ts
// Stores event/poll records so RSVP buttons keep working across restarts.
// Prunes to at most 20 records and drops any older than 30 days.
import { createJsonFileStore } from "./jsonFile";
import { dataFilePath } from "./paths";
import { LIMITS } from "../config/constants";
import { defaultEventFile, type EventFile, type EventRecord } from "./types";

// The event store surface used by the poll and event-DM services.
export interface EventStore {
  get(id: string): EventRecord | undefined;
  all(): readonly EventRecord[];
  upsert(record: EventRecord): Promise<void>;
}

// Removes events older than 30 days, then keeps the newest 20.
function prune(events: EventRecord[], now: number): EventRecord[] {
  const recent = events.filter((event) => now - event.createdAt <= LIMITS.pollMaxAgeMs);
  if (recent.length <= LIMITS.pollMaxStored) {
    return recent;
  }
  // events are kept newest-last, so slice from the end.
  return recent.slice(recent.length - LIMITS.pollMaxStored);
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

  return { get, all, upsert };
}
