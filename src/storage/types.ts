// storage/types.ts
// Persisted data shapes and their safe defaults. These are stored as JSON in
// the data/ folder (settings.json, events.json, activity.json).

// How a stat value is displayed in a card.
export type StatFormat = "text" | "number" | "percent";

// One configured field in a stats card: either a single column or a ratio of
// two columns (for example Kills ÷ Deaths).
export type StatField =
  | { kind: "value"; header: string; label: string; format: StatFormat; inline: boolean }
  | {
      kind: "ratio";
      numeratorHeader: string;
      denominatorHeader: string;
      label: string;
      inline: boolean;
    };

// A configured Google Sheet source. scriptUrl and secret are never logged or
// shown to users.
export type StatsSource = {
  id: string;
  displayName: string;
  scriptUrl: string;
  secret: string;
  tab: string;
  headerRow: number;
  startColumn: string;
  usernameHeader: string;
  accentColor: number | null;
  enabled: boolean;
  fields: StatField[];
};

// The bot's settings, stored in settings.json.
// A Discord role paired with a display label, used for special assignments and
// regiments shown on the /userinfo card.
export type RoleLabel = { roleId: string; label: string };

export type Settings = {
  version: 1;
  commandRoles: Record<string, string[]>;
  eventDmExcludedRoleIds: string[];
  statsSources: StatsSource[];
  usernameAliases: Record<string, string[]>;
  specialAssignments: RoleLabel[];
  regiments: RoleLabel[];
  logChannelId: string | null;
};

// A recorded RSVP answer.
export type Answer = "yes" | "maybe" | "no";

// A stored event/poll, in events.json.
export type EventRecord = {
  id: string;
  title: string;
  guildId: string;
  createdBy: string;
  createdAt: number;
  closesAt: number;
  resultsChannelId: string;
  summaryMessageId: string | null;
  recipientIds: string[];
  displayNames: Record<string, string>;
  dmFailedCount: number;
  answers: Record<string, Answer>;
};

// The events file shape: newest last, capped elsewhere.
export type EventFile = { version: 1; events: EventRecord[] };

// The activity file shape: user ID -> last-active ms timestamp.
export type ActivityFile = { version: 1; lastActive: Record<string, number> };

// Safe default settings for a fresh install.
export function defaultSettings(): Settings {
  return {
    version: 1,
    commandRoles: {},
    eventDmExcludedRoleIds: [],
    statsSources: [],
    usernameAliases: {},
    specialAssignments: [],
    regiments: [],
    logChannelId: null,
  };
}

// Safe default events file.
export function defaultEventFile(): EventFile {
  return { version: 1, events: [] };
}

// Safe default activity file.
export function defaultActivityFile(): ActivityFile {
  return { version: 1, lastActive: {} };
}
