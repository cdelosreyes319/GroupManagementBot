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
// A Discord role paired with a display label and an optional emoji, used for the
// regiment, special-assignment, and imperial-honour lists shown on /userinfo.
// The emoji (unicode or a custom `<:name:id>`) is shown before the label.
export type RoleLabel = { roleId: string; label: string; emoji: string | null };

export type Settings = {
  version: 1;
  commandRoles: Record<string, string[]>;
  eventDmExcludedRoleIds: string[];
  eventDmBlacklist: string[];
  statsSources: StatsSource[];
  usernameAliases: Record<string, string[]>;
  regiments: RoleLabel[];
  specialAssignments: RoleLabel[];
  imperialHonours: RoleLabel[];
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
    eventDmBlacklist: [],
    statsSources: [],
    usernameAliases: {},
    regiments: [],
    specialAssignments: [],
    imperialHonours: [],
    logChannelId: null,
  };
}

// Fills top-level keys missing from a loaded settings.json with their defaults.
// The file on the server may predate fields added later (for example
// eventDmBlacklist), and code reads those fields without checking for them.
export function withSettingsDefaults(loaded: Partial<Settings>): Settings {
  return { ...defaultSettings(), ...loaded };
}

// Safe default events file.
export function defaultEventFile(): EventFile {
  return { version: 1, events: [] };
}

// Safe default activity file.
export function defaultActivityFile(): ActivityFile {
  return { version: 1, lastActive: {} };
}
