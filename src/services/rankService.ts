// services/rankService.ts
// Sets a member's rank in one managed group, then optionally syncs the Corps
// rank from an Empire Français change. Dependencies are injected so tests use
// fakes; a Corps failure never undoes the EF change.
import { MANAGED_GROUPS, LIMITS } from "../config/constants";
import { RANK_SYNC_RULES } from "../config/rankSync";
import type { GroupRole } from "../api/roblox";
import { TTLCache } from "../utils/ttlCache";
import { canBotAssign } from "./groupAccess";
import { findSyncRule } from "./rankSyncService";
import { normaliseName } from "../utils/text";

const EF = MANAGED_GROUPS.find((g) => g.key === "main")!;
const CORPS = MANAGED_GROUPS.find((g) => g.key === "corps")!;

// The result of changing a rank in one group.
export type RankOutcome = { oldRankName: string; newRankName: string; changed: boolean };

// The result of the optional Corps sync step.
export type CorpsSyncOutcome =
  | { status: "off" }
  | { status: "no_rule" }
  | { status: "not_member" }
  | { status: "unchanged"; rankName: string }
  | { status: "changed"; oldRankName: string; newRankName: string }
  | { status: "failed"; reason: string };

// The overall result: either a refusal, or the EF/target change plus Corps sync.
export type SetRankResult =
  | { refused: string }
  | { main: RankOutcome; corps: CorpsSyncOutcome };

// What the caller wants: who, which group, which new rank, and whether to sync.
export type SetRankInput = {
  robloxUserId: number;
  groupKey: "main" | "corps";
  newRank: number;
  syncCorps: boolean;
};

// The external calls the service needs, injected for testability.
export type RankServiceDeps = {
  getRankInGroup(groupId: number, userId: number): Promise<number>;
  getGroupRoles(groupId: number): Promise<GroupRole[]>;
  setRank(groupId: number, userId: number, rankNumber: number): Promise<void>;
  getBotUserId(): number;
};

// Builds the rank service with a 5-minute per-group role cache.
export function createRankService(deps: RankServiceDeps) {
  const rolesCache = new TTLCache<number, GroupRole[]>(4, LIMITS.groupRolesCacheTtlMs);

  // Returns a group's roles, using the cache when warm.
  async function roles(groupId: number): Promise<GroupRole[]> {
    const cached = rolesCache.get(groupId);
    if (cached) {
      return cached;
    }
    const fetched = await deps.getGroupRoles(groupId);
    rolesCache.set(groupId, fetched);
    return fetched;
  }

  // Finds a role's display name by rank number ("Unknown" if not found).
  function roleName(list: GroupRole[], rank: number): string {
    return list.find((role) => role.rank === rank)?.name ?? "Unknown";
  }

  // Sets a rank in one group after all the safety checks, then syncs the Corps
  // rank if the change was in Empire Français and syncCorps is on.
  async function setRankWithSync(input: SetRankInput): Promise<SetRankResult> {
    const group = input.groupKey === "main" ? EF : CORPS;
    const groupRoles = await roles(group.id);

    const botRank = await deps.getRankInGroup(group.id, deps.getBotUserId());
    const targetRank = await deps.getRankInGroup(group.id, input.robloxUserId);

    if (targetRank === 0) {
      return { refused: "That member is not in the group. Use /accept first." };
    }
    const allowed = canBotAssign(botRank, targetRank, input.newRank);
    if (!allowed.ok) {
      return { refused: allowed.why };
    }
    if (targetRank === input.newRank) {
      return {
        main: {
          oldRankName: roleName(groupRoles, targetRank),
          newRankName: roleName(groupRoles, input.newRank),
          changed: false,
        },
        corps: { status: "off" },
      };
    }

    const oldRankName = roleName(groupRoles, targetRank);
    await deps.setRank(group.id, input.robloxUserId, input.newRank);
    const main: RankOutcome = {
      oldRankName,
      newRankName: roleName(groupRoles, input.newRank),
      changed: true,
    };

    // Corps sync only runs one way: from an Empire Français change.
    if (input.groupKey !== "main" || !input.syncCorps) {
      return { main, corps: { status: "off" } };
    }

    const corps = await syncCorps(input.robloxUserId, input.newRank);
    return { main, corps };
  }

  // Runs the Corps sync from a new EF rank number. Never throws to the caller;
  // failures are returned so the EF change is kept.
  async function syncCorps(robloxUserId: number, newEfRank: number): Promise<CorpsSyncOutcome> {
    const rule = findSyncRule(newEfRank, RANK_SYNC_RULES);
    if (!rule) {
      return { status: "no_rule" };
    }

    const corpsRank = await deps.getRankInGroup(CORPS.id, robloxUserId);
    if (corpsRank === 0) {
      return { status: "not_member" };
    }

    const corpsRoles = await roles(CORPS.id);
    const target = corpsRoles.find(
      (role) => normaliseName(role.name) === normaliseName(rule.corpsRoleName),
    );
    if (!target) {
      return { status: "failed", reason: `Corps role "${rule.corpsRoleName}" does not exist.` };
    }
    if (target.rank === corpsRank) {
      return { status: "unchanged", rankName: target.name };
    }

    const botRank = await deps.getRankInGroup(CORPS.id, deps.getBotUserId());
    const allowed = canBotAssign(botRank, corpsRank, target.rank);
    if (!allowed.ok) {
      return { status: "failed", reason: allowed.why };
    }

    const oldRankName =
      corpsRoles.find((role) => role.rank === corpsRank)?.name ?? "Unknown";
    try {
      await deps.setRank(CORPS.id, robloxUserId, target.rank);
    } catch {
      return { status: "failed", reason: "Roblox rejected the Corps rank change." };
    }
    return { status: "changed", oldRankName, newRankName: target.name };
  }

  // Returns a group's roles for autocomplete (cached).
  async function getRolesForGroup(groupKey: "main" | "corps"): Promise<GroupRole[]> {
    const group = groupKey === "main" ? EF : CORPS;
    return roles(group.id);
  }

  return { setRankWithSync, getRolesForGroup };
}
