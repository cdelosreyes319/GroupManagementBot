import { describe, test, expect, vi } from "vitest";
import { createStatsService } from "./statsService";
import type { StatsSource } from "../storage/types";
import type { RobloxAccount } from "./robloxAccount";
import type { StatsEndpointResult } from "../api/statsEndpoint";

const account: RobloxAccount = {
  userId: 42,
  username: "CurrentName",
  profileUrl: "https://www.roblox.com/users/42/profile",
};

function makeSource(over: Partial<StatsSource> = {}): StatsSource {
  return {
    id: "s1",
    displayName: "Source 1",
    scriptUrl: "https://script.google.com/x",
    secret: "s",
    tab: "Roster",
    headerRow: 1,
    startColumn: "A",
    usernameHeader: "Username",
    accentColor: null,
    enabled: true,
    fields: [{ kind: "value", header: "Kills", label: "Kills", format: "number", inline: true }],
    ...over,
  };
}

describe("findPlayerStats", () => {
  test("matches on the current username", async () => {
    const queryEndpoint = vi.fn(
      async (): Promise<StatsEndpointResult> => ({
        ok: true,
        found: true,
        matchedUsername: "CurrentName",
        row: { Kills: 5 },
        missingHeaders: [],
      }),
    );
    const service = createStatsService(() => [makeSource()], () => [], {
      getPreviousUsernames: async () => [],
      queryEndpoint,
    });
    const { results, failures } = await service.findPlayerStats(account);
    expect(failures).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0].matchedByOldName).toBe(false);
  });

  test("flags a match found by an old username", async () => {
    const queryEndpoint = vi.fn(
      async (): Promise<StatsEndpointResult> => ({
        ok: true,
        found: true,
        matchedUsername: "OldName",
        row: { Kills: 5 },
        missingHeaders: [],
      }),
    );
    const service = createStatsService(() => [makeSource()], () => [], {
      getPreviousUsernames: async () => ["OldName"],
      queryEndpoint,
    });
    const { results } = await service.findPlayerStats(account);
    expect(results[0].matchedByOldName).toBe(true);
  });

  test("includes aliases in the name list", async () => {
    const queryEndpoint = vi.fn(
      async (): Promise<StatsEndpointResult> => ({ ok: true, found: false, matchedUsername: null, row: {}, missingHeaders: [] }),
    );
    const service = createStatsService(() => [makeSource()], () => ["AliasName"], {
      getPreviousUsernames: async () => ["OldName"],
      queryEndpoint,
    });
    await service.findPlayerStats(account);
    const namesArg = (queryEndpoint.mock.calls[0] as unknown[])[1] as string[];
    expect(namesArg).toEqual(["CurrentName", "OldName", "AliasName"]);
  });

  test("returns nothing when the player is not found", async () => {
    const service = createStatsService(() => [makeSource()], () => [], {
      getPreviousUsernames: async () => [],
      queryEndpoint: async () => ({ ok: true, found: false, matchedUsername: null, row: {}, missingHeaders: [] }),
    });
    const { results, failures } = await service.findPlayerStats(account);
    expect(results).toEqual([]);
    expect(failures).toEqual([]);
  });

  test("one failing source does not block another succeeding", async () => {
    const queryEndpoint = vi.fn(async (source: StatsSource): Promise<StatsEndpointResult> => {
      if (source.id === "bad") {
        return { ok: false, error: "INTERNAL" };
      }
      return { ok: true, found: true, matchedUsername: "CurrentName", row: { Kills: 1 }, missingHeaders: [] };
    });
    const service = createStatsService(
      () => [makeSource({ id: "bad", displayName: "Bad" }), makeSource({ id: "good", displayName: "Good" })],
      () => [],
      { getPreviousUsernames: async () => [], queryEndpoint },
    );
    const { results, failures } = await service.findPlayerStats(account);
    expect(results).toHaveLength(1);
    expect(results[0].source.id).toBe("good");
    expect(failures).toEqual([{ sourceName: "Bad", error: expect.any(String) }]);
  });

  test("reuses the cache for the same source and player", async () => {
    const queryEndpoint = vi.fn(
      async (): Promise<StatsEndpointResult> => ({ ok: true, found: true, matchedUsername: "CurrentName", row: {}, missingHeaders: [] }),
    );
    const service = createStatsService(() => [makeSource()], () => [], {
      getPreviousUsernames: async () => [],
      queryEndpoint,
    });
    await service.findPlayerStats(account);
    await service.findPlayerStats(account);
    expect(queryEndpoint).toHaveBeenCalledTimes(1);
  });

  test("username history failing still searches with current name and aliases", async () => {
    const queryEndpoint = vi.fn(
      async (): Promise<StatsEndpointResult> => ({ ok: true, found: false, matchedUsername: null, row: {}, missingHeaders: [] }),
    );
    const service = createStatsService(() => [makeSource()], () => ["AliasOnly"], {
      getPreviousUsernames: async () => [], // history returned empty (as on failure)
      queryEndpoint,
    });
    await service.findPlayerStats(account);
    const namesArg = (queryEndpoint.mock.calls[0] as unknown[])[1] as string[];
    expect(namesArg).toEqual(["CurrentName", "AliasOnly"]);
  });

  test("only queries the chosen source when a sourceId is given", async () => {
    const queryEndpoint = vi.fn(
      async (): Promise<StatsEndpointResult> => ({ ok: true, found: true, matchedUsername: "CurrentName", row: {}, missingHeaders: [] }),
    );
    const service = createStatsService(
      () => [makeSource({ id: "a" }), makeSource({ id: "b" })],
      () => [],
      { getPreviousUsernames: async () => [], queryEndpoint },
    );
    await service.findPlayerStats(account, "b");
    expect(queryEndpoint).toHaveBeenCalledTimes(1);
    expect(((queryEndpoint.mock.calls[0] as unknown[])[0] as StatsSource).id).toBe("b");
  });
});
