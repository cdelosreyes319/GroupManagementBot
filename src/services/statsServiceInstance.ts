// services/statsServiceInstance.ts
// Wires the stats service to the settings store, alias lookups, the Roblox
// username-history API, and the stats endpoint client, and exposes a singleton.
import type { SettingsStore } from "../storage/settingsStore";
import { getPreviousUsernames } from "../api/roblox";
import { queryStatsEndpoint } from "../api/statsEndpoint";
import { createStatsService, type StatsService } from "./statsService";

let instance: StatsService | null = null;

// Builds and stores the shared stats service.
export function configureStatsService(settings: SettingsStore): StatsService {
  instance = createStatsService(
    () => settings.get().statsSources,
    (robloxUserId) => settings.get().usernameAliases[robloxUserId] ?? [],
    {
      getPreviousUsernames,
      queryEndpoint: (source, usernames, headers) => queryStatsEndpoint(source, usernames, headers),
    },
  );
  return instance;
}

// Returns the shared stats service, throwing if it was never configured.
export function getStatsService(): StatsService {
  if (!instance) {
    throw new Error("Stats service used before it was configured.");
  }
  return instance;
}
