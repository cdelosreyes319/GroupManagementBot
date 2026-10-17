import { describe, test, expect } from "vitest";
import { classifyMemberFetchError } from "./memberFetchError";
import { LIMITS } from "../config/constants";

// Builds an error shaped like @discordjs/util's GatewayRateLimitError.
function rateLimitError(retryAfter: unknown): Error {
  const error = new Error("Request with opcode 8 was rate limited.");
  error.name = "GatewayRateLimitError";
  Object.assign(error, { data: { opcode: 8, retry_after: retryAfter } });
  return error;
}

describe("classifyMemberFetchError", () => {
  test("recognises a gateway rate limit and rounds the wait up", () => {
    expect(classifyMemberFetchError(rateLimitError(12.3))).toEqual({ kind: "rate_limited", retryAfterSeconds: 13 });
  });

  test("waits at least one second", () => {
    expect(classifyMemberFetchError(rateLimitError(0))).toEqual({ kind: "rate_limited", retryAfterSeconds: 1 });
  });

  test("falls back to the LIMITS wait when retry_after is missing", () => {
    expect(classifyMemberFetchError(rateLimitError(undefined))).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: LIMITS.memberFetchRetryFallbackSeconds,
    });
  });

  test("recognises the discord.js member fetch timeout", () => {
    const error = Object.assign(new Error("Members didn't arrive in time."), { code: "GuildMembersTimeout" });
    expect(classifyMemberFetchError(error)).toEqual({ kind: "timeout" });
  });

  test("returns null for any other error", () => {
    expect(classifyMemberFetchError(new Error("boom"))).toBeNull();
    expect(classifyMemberFetchError("not an error")).toBeNull();
    expect(classifyMemberFetchError(null)).toBeNull();
  });
});
