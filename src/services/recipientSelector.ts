// services/recipientSelector.ts
// Pure function that chooses who receives an event DM: removes bots, the
// sender, and excluded-role members, sorts by recent activity, then keeps the
// first `limit`. Excluded members are removed before the limit so they never
// use up sending capacity.

// One candidate member (only the fields selection needs).
export type Candidate = { id: string; isBot: boolean; roleIds: string[]; joinedAt: number };

// The inputs to recipient selection.
export type SelectRecipientsInput = {
  candidates: Candidate[];
  senderId: string;
  excludedRoleIds: string[];
  limit: number;
  lastActive: (userId: string) => number;
};

// The result: the chosen recipients plus the counts shown in the preview.
export type SelectRecipientsResult = {
  recipients: Candidate[];
  eligibleCount: number;
  excludedCount: number;
  senderSkipped: boolean;
};

// Selects recipients following the documented algorithm.
export function selectRecipients(input: SelectRecipientsInput): SelectRecipientsResult {
  const excludedSet = new Set(input.excludedRoleIds);
  let senderSkipped = false;
  let excludedCount = 0;

  const eligible: Candidate[] = [];
  for (const candidate of input.candidates) {
    if (candidate.isBot) {
      continue;
    }
    if (candidate.id === input.senderId) {
      senderSkipped = true;
      continue;
    }
    if (candidate.roleIds.some((roleId) => excludedSet.has(roleId))) {
      excludedCount++;
      continue;
    }
    eligible.push(candidate);
  }

  // Sort by last activity (desc). Ties and no-activity fall back to join date
  // (desc), then ID for a stable order.
  const sorted = [...eligible].sort((a, b) => {
    const activeDiff = input.lastActive(b.id) - input.lastActive(a.id);
    if (activeDiff !== 0) {
      return activeDiff;
    }
    const joinDiff = b.joinedAt - a.joinedAt;
    if (joinDiff !== 0) {
      return joinDiff;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    recipients: sorted.slice(0, input.limit),
    eligibleCount: eligible.length,
    excludedCount,
    senderSkipped,
  };
}
