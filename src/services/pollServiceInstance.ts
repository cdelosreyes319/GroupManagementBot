// services/pollServiceInstance.ts
// Exposes a single shared poll service, wired to the event store and a callback
// that edits the summary message in the results channel.
import type { EventStore } from "../storage/eventStore";
import type { EventRecord } from "../storage/types";
import { createPollService, type PollService } from "./pollService";

let instance: PollService | null = null;

// Builds and stores the shared poll service.
export function configurePollService(
  eventStore: EventStore,
  onSummaryEdit: (event: EventRecord) => Promise<void>,
): PollService {
  instance = createPollService({ eventStore, onSummaryEdit });
  return instance;
}

// Returns the shared poll service, throwing if it was never configured.
export function getPollService(): PollService {
  if (!instance) {
    throw new Error("Poll service used before it was configured.");
  }
  return instance;
}
