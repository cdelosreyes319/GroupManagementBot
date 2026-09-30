import { describe, test, expect, vi } from "vitest";
import { createRobloxAccountLookup } from "./robloxAccount";
import type { BloxlinkResult } from "../api/bloxlink";

// Helper to build a lookup with controllable fake dependencies.
function makeLookup(bloxlinkResult: BloxlinkResult, username = "SergentDubois") {
  const fetchRobloxId = vi.fn(async (): Promise<BloxlinkResult> => bloxlinkResult);
  const getUsername = vi.fn(async () => username);
  const { findRobloxAccount } = createRobloxAccountLookup({ fetchRobloxId, getUsername });
  return { findRobloxAccount, fetchRobloxId, getUsername };
}

describe("findRobloxAccount", () => {
  test("resolves a linked account with a profile URL", async () => {
    const { findRobloxAccount } = makeLookup({ ok: true, robloxId: 42 });
    const result = await findRobloxAccount("discord-1");
    expect(result).toEqual({
      ok: true,
      account: {
        userId: 42,
        username: "SergentDubois",
        profileUrl: "https://www.roblox.com/users/42/profile",
      },
    });
  });

  test("reuses the cache on a second lookup", async () => {
    const { findRobloxAccount, fetchRobloxId, getUsername } = makeLookup({
      ok: true,
      robloxId: 42,
    });
    await findRobloxAccount("discord-1");
    await findRobloxAccount("discord-1");
    expect(fetchRobloxId).toHaveBeenCalledTimes(1);
    expect(getUsername).toHaveBeenCalledTimes(1);
  });

  test("returns not_linked when Bloxlink says so", async () => {
    const { findRobloxAccount } = makeLookup({ ok: false, reason: "not_linked" });
    const result = await findRobloxAccount("discord-2");
    expect(result).toEqual({ ok: false, reason: "not_linked" });
  });

  test("returns timeout when Bloxlink times out", async () => {
    const { findRobloxAccount } = makeLookup({ ok: false, reason: "timeout" });
    const result = await findRobloxAccount("discord-3");
    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  test("does not cache a failed lookup", async () => {
    const { findRobloxAccount, fetchRobloxId } = makeLookup({
      ok: false,
      reason: "bloxlink_error",
    });
    await findRobloxAccount("discord-4");
    await findRobloxAccount("discord-4");
    expect(fetchRobloxId).toHaveBeenCalledTimes(2);
  });
});
