// api/bloxlink.ts
// Thin wrapper over the Bloxlink public API that maps a Discord user ID to a
// Roblox user ID. Returns a typed result so callers can show a specific message.
// Never logs the API key or the full request headers.
import { LIMITS } from "../config/constants";

// The outcome of a Bloxlink lookup. `not_linked` means the player has not
// verified; the other reasons are transient.
export type BloxlinkResult =
  | { ok: true; robloxId: number }
  | { ok: false; reason: "not_linked" | "bloxlink_error" | "timeout" };

// Inputs the wrapper needs. Passed in so tests can supply a fake fetch and
// avoid using real secrets.
export type BloxlinkDeps = {
  guildId: string;
  apiKey: string;
  fetchFn?: typeof fetch;
};

// Looks up the Roblox user ID linked to a Discord user via Bloxlink.
export async function fetchRobloxIdForDiscordUser(
  discordId: string,
  deps: BloxlinkDeps,
): Promise<BloxlinkResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const url = `https://api.blox.link/v4/public/guilds/${deps.guildId}/discord-to-roblox/${discordId}`;

  try {
    const response = await fetchFn(url, {
      headers: { Authorization: deps.apiKey },
      signal: AbortSignal.timeout(LIMITS.httpTimeoutMs),
    });

    // 404 (and Bloxlink's "not linked" bodies) mean the user has not verified.
    if (response.status === 404) {
      return { ok: false, reason: "not_linked" };
    }

    const body = (await response.json()) as { robloxID?: string | number; error?: string };

    if (!response.ok || body.error) {
      if (isNotLinkedError(body.error)) {
        return { ok: false, reason: "not_linked" };
      }
      console.error("Bloxlink lookup failed with a service error.");
      return { ok: false, reason: "bloxlink_error" };
    }

    const robloxId = Number(body.robloxID);
    if (!body.robloxID || Number.isNaN(robloxId)) {
      return { ok: false, reason: "not_linked" };
    }
    return { ok: true, robloxId };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, reason: "timeout" };
    }
    console.error("Bloxlink lookup threw a network error.");
    return { ok: false, reason: "bloxlink_error" };
  }
}

// Detects Bloxlink error bodies that indicate the user is simply not linked.
function isNotLinkedError(error: string | undefined): boolean {
  if (!error) {
    return false;
  }
  return error.toLowerCase().includes("not linked") || error.toLowerCase().includes("not verified");
}
