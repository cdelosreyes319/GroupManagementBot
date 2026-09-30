import { describe, test, expect } from "vitest";
import { queryStatsEndpoint, isAllowedEndpointHost } from "./statsEndpoint";
import type { StatsSource } from "../storage/types";

// A source with an allowed host.
function makeSource(over: Partial<StatsSource> = {}): StatsSource {
  return {
    id: "s1",
    displayName: "Source",
    scriptUrl: "https://script.google.com/macros/s/abc/exec",
    secret: "shh",
    tab: "Roster",
    headerRow: 1,
    startColumn: "A",
    usernameHeader: "Username",
    accentColor: null,
    enabled: true,
    fields: [],
    ...over,
  };
}

// Builds a fake fetch that returns the given JSON body.
function fakeFetch(body: unknown, opts: { throwName?: string; badJson?: boolean } = {}): typeof fetch {
  return (async () => {
    if (opts.throwName) {
      const err = new Error("fail");
      err.name = opts.throwName;
      throw err;
    }
    return {
      json: async () => {
        if (opts.badJson) {
          throw new Error("bad json");
        }
        return body;
      },
    } as Response;
  }) as unknown as typeof fetch;
}

describe("isAllowedEndpointHost", () => {
  test("accepts script.google.com", () => {
    expect(isAllowedEndpointHost("https://script.google.com/macros/s/x/exec")).toBe(true);
  });
  test("accepts script.googleusercontent.com", () => {
    expect(isAllowedEndpointHost("https://script.googleusercontent.com/x")).toBe(true);
  });
  test("rejects other hosts", () => {
    expect(isAllowedEndpointHost("https://evil.example.com/x")).toBe(false);
  });
  test("rejects an invalid URL", () => {
    expect(isAllowedEndpointHost("not a url")).toBe(false);
  });
});

describe("queryStatsEndpoint", () => {
  test("returns a found result with a row", async () => {
    const fetchFn = fakeFetch({
      ok: true,
      found: true,
      matchedUsername: "OldName",
      row: { Kills: 5 },
      missingHeaders: [],
    });
    const result = await queryStatsEndpoint(makeSource(), ["Name"], ["Kills"], fetchFn);
    expect(result).toEqual({
      ok: true,
      found: true,
      matchedUsername: "OldName",
      row: { Kills: 5 },
      missingHeaders: [],
    });
  });

  test("returns a not-found result", async () => {
    const fetchFn = fakeFetch({ ok: true, found: false, missingHeaders: [] });
    const result = await queryStatsEndpoint(makeSource(), ["Name"], ["Kills"], fetchFn);
    expect(result).toMatchObject({ ok: true, found: false, row: {} });
  });

  test("maps each endpoint error code", async () => {
    for (const code of ["BAD_SECRET", "TAB_NOT_FOUND", "HEADER_NOT_FOUND", "BAD_REQUEST", "INTERNAL"] as const) {
      const result = await queryStatsEndpoint(makeSource(), ["N"], ["H"], fakeFetch({ ok: false, error: code }));
      expect(result).toEqual({ ok: false, error: code });
    }
  });

  test("treats an unknown error code as BAD_RESPONSE", async () => {
    const result = await queryStatsEndpoint(makeSource(), ["N"], ["H"], fakeFetch({ ok: false, error: "WEIRD" }));
    expect(result).toEqual({ ok: false, error: "BAD_RESPONSE" });
  });

  test("treats malformed JSON as BAD_RESPONSE", async () => {
    const result = await queryStatsEndpoint(makeSource(), ["N"], ["H"], fakeFetch(null, { badJson: true }));
    expect(result).toEqual({ ok: false, error: "BAD_RESPONSE" });
  });

  test("treats an unexpected shape as BAD_RESPONSE", async () => {
    const result = await queryStatsEndpoint(makeSource(), ["N"], ["H"], fakeFetch({ hello: "world" }));
    expect(result).toEqual({ ok: false, error: "BAD_RESPONSE" });
  });

  test("rejects a disallowed host before calling fetch", async () => {
    const result = await queryStatsEndpoint(
      makeSource({ scriptUrl: "https://evil.example.com/x" }),
      ["N"],
      ["H"],
      fakeFetch({ ok: true, found: false, missingHeaders: [] }),
    );
    expect(result).toEqual({ ok: false, error: "BAD_HOST" });
  });

  test("maps a timeout", async () => {
    const result = await queryStatsEndpoint(makeSource(), ["N"], ["H"], fakeFetch(null, { throwName: "TimeoutError" }));
    expect(result).toEqual({ ok: false, error: "TIMEOUT" });
  });

  test("maps a network failure to UNREACHABLE", async () => {
    const result = await queryStatsEndpoint(makeSource(), ["N"], ["H"], fakeFetch(null, { throwName: "TypeError" }));
    expect(result).toEqual({ ok: false, error: "UNREACHABLE" });
  });
});
