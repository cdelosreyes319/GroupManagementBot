// utils/memberFetchError.ts
// Recognises the two ways a full guild member fetch can fail that are worth
// explaining to the officer: Discord rate-limiting the request, and the
// discord.js timeout. Everything else is left to the router's generic error.
import { LIMITS } from "../config/constants";

// A member fetch failure the caller can explain, or null for anything else.
export type MemberFetchFailure = { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "timeout" };

// Classifies an error thrown by guild.members.fetch(). Checks names and codes
// rather than classes, because GatewayRateLimitError lives in @discordjs/util,
// which is not a direct dependency.
export function classifyMemberFetchError(error: unknown): MemberFetchFailure | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.name === "GatewayRateLimitError") {
    return { kind: "rate_limited", retryAfterSeconds: readRetryAfterSeconds(error) };
  }
  if ("code" in error && error.code === "GuildMembersTimeout") {
    return { kind: "timeout" };
  }
  return null;
}

// Reads `data.retry_after` (seconds) from a rate-limit error, rounded up to a
// whole second, falling back to LIMITS when it is missing.
function readRetryAfterSeconds(error: Error): number {
  if (!("data" in error) || typeof error.data !== "object" || error.data === null) {
    return LIMITS.memberFetchRetryFallbackSeconds;
  }
  if (!("retry_after" in error.data) || typeof error.data.retry_after !== "number") {
    return LIMITS.memberFetchRetryFallbackSeconds;
  }
  return Math.max(1, Math.ceil(error.data.retry_after));
}
