// services/rankRoleService.ts
// Pure helpers over the rank-role map: find the Discord role for an EF rank,
// list the full managed set, and compute the role change needed for a member.
import { RANK_ROLES, type RankRole } from "../config/rankRoles";

// Returns the Discord role ID mapped to an EF rank, or null if unmapped
// (ranks above Colonel, or 0/255).
export function findRankRoleId(efRank: number, rules: RankRole[] = RANK_ROLES): string | null {
  return rules.find((r) => r.efRank === efRank)?.discordRoleId ?? null;
}

// Returns the full set of managed rank-role IDs (every role the sync may touch).
export function managedRankRoleIds(rules: RankRole[] = RANK_ROLES): string[] {
  return rules.map((r) => r.discordRoleId);
}

// The result of computing which rank roles to add and remove for a member.
export type RankRoleChange = {
  add: string | null; // the new rank role to add (null if the rank is unmapped)
  remove: string[]; // managed rank roles the member currently holds that should go
};

// Computes the role change: the new rank's role plus every OTHER managed rank
// role the member currently holds (so the old rank role is replaced). Roles
// outside the managed set are never included. If the new rank is unmapped,
// `add` is null and nothing is removed (the caller reports "not changed").
export function computeRankRoleChange(
  newEfRank: number,
  memberRoleIds: string[],
  rules: RankRole[] = RANK_ROLES,
): RankRoleChange {
  const newRoleId = findRankRoleId(newEfRank, rules);
  if (!newRoleId) {
    return { add: null, remove: [] };
  }
  const managed = new Set(managedRankRoleIds(rules));
  const remove = memberRoleIds.filter((id) => managed.has(id) && id !== newRoleId);
  return { add: newRoleId, remove };
}
