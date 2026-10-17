// interactions/eventDmContext.ts
// Holds the dependencies shared by the /eventdm interaction files (preview,
// send, poll). main.ts wires them once at startup.
import type { Client } from "discord.js";
import type { SettingsStore } from "../storage/settingsStore";
import type { EventDmService } from "../services/eventDmService";
import type { ActivityTracker } from "../services/activityTracker";
import type { PollService } from "../services/pollService";
import type { EventStore } from "../storage/eventStore";
import type { LogEntry } from "../services/commandLogger";

// Everything the /eventdm interaction handlers need, injected at wiring time.
export type EventDmDeps = {
  client: Client;
  settings: SettingsStore;
  eventDm: EventDmService;
  activity: ActivityTracker;
  poll: PollService;
  eventStore: EventStore;
  logCommand?: (entry: LogEntry) => void;
  alertCommand?: (text: string) => void;
};

let deps: EventDmDeps | null = null;

// Wires the handler dependencies (called once from main.ts).
export function configureEventDmInteractions(d: EventDmDeps): void {
  deps = d;
}

// Returns the wired dependencies, throwing if main.ts never configured them.
export function getEventDmDeps(): EventDmDeps {
  if (!deps) {
    throw new Error("Event DM interactions used before they were configured.");
  }
  return deps;
}
