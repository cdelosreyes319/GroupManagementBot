// api/statsEndpoint.ts
// Calls an officer-created Google Apps Script endpoint that returns one player's
// sheet row as JSON. The URL host is restricted to Google script hosts, the
// response shape is validated with a hand-written type guard, and the URL and
// secret are never logged.
import { LIMITS } from "../config/constants";
import type { StatsSource } from "../storage/types";

// The error codes the endpoint (or this client) may report.
export type StatsEndpointError =
  | "BAD_SECRET"
  | "TAB_NOT_FOUND"
  | "HEADER_NOT_FOUND"
  | "BAD_REQUEST"
  | "INTERNAL"
  | "BAD_RESPONSE"
  | "BAD_HOST"
  | "UNREACHABLE"
  | "TIMEOUT";

// A successful lookup: whether the player was found, which username matched,
// the row values, and any configured headers missing from the sheet.
export type StatsEndpointResult =
  | { ok: true; found: boolean; matchedUsername: string | null; row: Record<string, unknown>; missingHeaders: string[] }
  | { ok: false; error: StatsEndpointError };

// The allowed hosts for a Stats Endpoint URL.
const ALLOWED_HOSTS = new Set(["script.google.com", "script.googleusercontent.com"]);

// Returns true when a URL points at an allowed Google script host.
export function isAllowedEndpointHost(url: string): boolean {
  try {
    return ALLOWED_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

// Queries a Stats Endpoint for the given usernames and headers. `fetchFn` is
// injected so tests use a fake fetch (no real sheet or network).
export async function queryStatsEndpoint(
  source: StatsSource,
  usernames: string[],
  headers: string[],
  fetchFn: typeof fetch = fetch,
): Promise<StatsEndpointResult> {
  if (!isAllowedEndpointHost(source.scriptUrl)) {
    return { ok: false, error: "BAD_HOST" };
  }

  const body = JSON.stringify({
    secret: source.secret,
    tab: source.tab,
    headerRow: source.headerRow,
    startColumn: source.startColumn,
    usernameHeader: source.usernameHeader,
    usernames,
    headers,
  });

  let response: Response;
  try {
    response = await fetchFn(source.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(LIMITS.httpTimeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, error: "TIMEOUT" };
    }
    return { ok: false, error: "UNREACHABLE" };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { ok: false, error: "BAD_RESPONSE" };
  }

  return interpret(parsed);
}

// Validates and interprets the parsed JSON response.
function interpret(parsed: unknown): StatsEndpointResult {
  if (!isObject(parsed) || typeof parsed.ok !== "boolean") {
    return { ok: false, error: "BAD_RESPONSE" };
  }

  if (parsed.ok === false) {
    const error = parsed.error;
    if (isKnownError(error)) {
      return { ok: false, error };
    }
    return { ok: false, error: "BAD_RESPONSE" };
  }

  // Success shape.
  if (typeof parsed.found !== "boolean") {
    return { ok: false, error: "BAD_RESPONSE" };
  }
  const missingHeaders = Array.isArray(parsed.missingHeaders)
    ? parsed.missingHeaders.filter((h): h is string => typeof h === "string")
    : [];

  if (!parsed.found) {
    return { ok: true, found: false, matchedUsername: null, row: {}, missingHeaders };
  }

  if (!isObject(parsed.row)) {
    return { ok: false, error: "BAD_RESPONSE" };
  }
  const matchedUsername = typeof parsed.matchedUsername === "string" ? parsed.matchedUsername : null;
  return { ok: true, found: true, matchedUsername, row: parsed.row, missingHeaders };
}

// Maps an endpoint error code to a plain-language message.
export function endpointErrorMessage(error: StatsEndpointError): string {
  switch (error) {
    case "BAD_SECRET":
      return "The endpoint rejected the secret.";
    case "TAB_NOT_FOUND":
      return "The endpoint could not find that tab.";
    case "HEADER_NOT_FOUND":
      return "The endpoint could not find the username header.";
    case "BAD_REQUEST":
      return "The endpoint rejected the request.";
    case "INTERNAL":
      return "The endpoint had an internal error.";
    case "BAD_RESPONSE":
      return "The endpoint returned an unexpected response.";
    case "BAD_HOST":
      return "The endpoint URL is not a Google Apps Script address.";
    case "UNREACHABLE":
      return "The endpoint could not be reached.";
    case "TIMEOUT":
      return "The endpoint took too long to respond.";
  }
}

// Type guard for a plain object.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Type guard for a known endpoint error code coming from the endpoint.
function isKnownError(value: unknown): value is StatsEndpointError {
  return (
    value === "BAD_SECRET" ||
    value === "TAB_NOT_FOUND" ||
    value === "HEADER_NOT_FOUND" ||
    value === "BAD_REQUEST" ||
    value === "INTERNAL"
  );
}
