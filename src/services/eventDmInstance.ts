// services/eventDmInstance.ts
// Exposes a single shared event-DM service to the /eventdm command and its
// interaction handlers.
import { createEventDmService, type EventDmService } from "./eventDmService";

let instance: EventDmService | null = null;

// Builds and stores the shared event-DM service (called once at startup).
export function configureEventDmService(): EventDmService {
  instance = createEventDmService();
  return instance;
}

// Returns the shared event-DM service, throwing if it was never configured.
export function getEventDmService(): EventDmService {
  if (!instance) {
    throw new Error("Event DM service used before it was configured.");
  }
  return instance;
}
