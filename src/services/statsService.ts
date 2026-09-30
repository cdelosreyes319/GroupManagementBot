// services/statsService.ts
// Searches configured stats sources for a player. Builds a de-duplicated name
// list (current username, previous usernames, manual aliases), queries at most
// 3 sources at a time, caches results, and collects per-source failures.
import { LIMITS } from "../config/constants";
import type { StatsSource, StatField } from "../storage/types";
import type { RobloxAccount } from "./robloxAccount";
import type { StatsEndpointResult, StatsEndpointError } from "../api/statsEndpoint";
import { endpointErrorMessage } from "../api/statsEndpoint";
import { TTLCache } from "../utils/ttlCache";
import { normaliseName } from "../utils/text";

// One source's successful result for a player.
export type SourceResult = {
  source: StatsSource;
  row: Record<string, unknown>;
  matchedUsername: string;
  matchedByOldName: boolean;
};

// The full search result: successes plus named failures.
export type StatsSearchResult = {
  results: SourceResult[];
  failures: { sourceName: string; error: string }[];
};

// The functions the service depends on, injected for testability.
export type StatsServiceDeps = {
  getPreviousUsernames: (userId: number, limit: number) => Promise<string[]>;
  queryEndpoint: (
    source: StatsSource,
    usernames: string[],
    headers: string[],
  ) => Promise<StatsEndpointResult>;
};

// Collects the headers a source's fields need (value + ratio columns).
function headersForSource(source: StatsSource): string[] {
  const headers = new Set<string>();
  for (const field of source.fields) {
    if (field.kind === "ratio") {
      headers.add(field.numeratorHeader);
      headers.add(field.denominatorHeader);
    } else {
      headers.add(field.header);
    }
  }
  return [...headers];
}

// Builds the ordered, de-duplicated username list to try for a player.
function buildNameList(current: string, previous: string[], aliases: string[]): string[] {
  const ordered = [current, ...previous, ...aliases];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of ordered) {
    const key = normaliseName(name);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}

// Runs an async worker over items with at most `concurrency` in flight.
async function mapWithLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, run);
  await Promise.all(runners);
  return results;
}

// Builds the stats search service over a settings accessor and injected deps.
export function createStatsService(
  getSources: () => StatsSource[],
  getAliases: (robloxUserId: string) => string[],
  deps: StatsServiceDeps,
) {
  const cache = new TTLCache<string, StatsEndpointResult>(LIMITS.statsCacheMax, LIMITS.statsCacheTtlMs);

  // Searches one source for the player and returns a per-source outcome.
  async function querySource(
    source: StatsSource,
    account: RobloxAccount,
    names: string[],
  ): Promise<{ result?: SourceResult; failure?: { sourceName: string; error: string } }> {
    const headers = headersForSource(source);
    const cacheKey = `${source.id}:${account.userId}`;
    let response = cache.get(cacheKey);
    if (!response) {
      response = await deps.queryEndpoint(source, names, headers);
      cache.set(cacheKey, response);
    }

    if (!response.ok) {
      return { failure: { sourceName: source.displayName, error: endpointErrorMessage(response.error) } };
    }
    if (!response.found) {
      return {};
    }
    const matched = response.matchedUsername ?? account.username;
    const matchedByOldName = normaliseName(matched) !== normaliseName(account.username);
    return {
      result: { source, row: response.row, matchedUsername: matched, matchedByOldName },
    };
  }

  // Searches all enabled sources (or one chosen source) for the player.
  async function findPlayerStats(
    account: RobloxAccount,
    sourceId?: string,
  ): Promise<StatsSearchResult> {
    const previous = await deps.getPreviousUsernames(account.userId, LIMITS.maxOldUsernames);
    const aliases = getAliases(String(account.userId)).slice(0, LIMITS.maxAliasesPerPlayer);
    const names = buildNameList(account.username, previous, aliases);

    let sources = getSources().filter((s) => s.enabled);
    if (sourceId) {
      sources = sources.filter((s) => s.id === sourceId);
    }

    const outcomes = await mapWithLimit(sources, LIMITS.maxStatsSourcesAtOnce, (source) =>
      querySource(source, account, names),
    );

    const results: SourceResult[] = [];
    const failures: { sourceName: string; error: string }[] = [];
    for (const outcome of outcomes) {
      if (outcome.result) {
        results.push(outcome.result);
      } else if (outcome.failure) {
        failures.push(outcome.failure);
      }
    }
    return { results, failures };
  }

  return { findPlayerStats, buildNameList: (c: string, p: string[], a: string[]) => buildNameList(c, p, a) };
}

export type StatsService = ReturnType<typeof createStatsService>;

// Re-export so callers can name the error type when needed.
export type { StatsEndpointError };
