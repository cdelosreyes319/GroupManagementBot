// services/groupAccess.ts
// Pure rule: can the bot assign a rank to a target, given the bot's own rank?
// Prevents assigning the guest/owner ranks or any rank at or above the bot.

// Decides whether the bot may change a target's rank to newRank.
// - newRank must not be 0 (guest) or 255 (owner) and must be below the bot.
// - the target must be a member (rank not 0) and below the bot.
export function canBotAssign(
  botRank: number,
  targetRank: number,
  newRank: number,
): { ok: true } | { ok: false; why: string } {
  if (newRank === 0) {
    return { ok: false, why: "Cannot assign the guest rank (0)." };
  }
  if (newRank === 255) {
    return { ok: false, why: "Cannot assign the owner rank (255)." };
  }
  if (newRank >= botRank) {
    return { ok: false, why: "That rank is at or above the bot's own rank." };
  }
  if (targetRank === 0) {
    return { ok: false, why: "The target is not a member of that group." };
  }
  if (targetRank >= botRank) {
    return { ok: false, why: "The target's current rank is at or above the bot's own rank." };
  }
  return { ok: true };
}
