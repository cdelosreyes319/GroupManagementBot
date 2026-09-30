// services/rankSyncService.ts
// Pure functions over the Rank Sync Table: find the rule for an EF rank,
// validate the table for mistakes, and check that the Corps role names exist.
// No Roblox calls here.
import type { RankSyncRule } from "../config/rankSync";
import type { GroupRole } from "../api/roblox";
import { normaliseName } from "../utils/text";

// Returns the rule whose range contains the given EF rank, or null if none.
export function findSyncRule(efRank: number, rules: RankSyncRule[]): RankSyncRule | null {
  return rules.find((rule) => efRank >= rule.efMin && efRank <= rule.efMax) ?? null;
}

// Checks the table for mistakes and returns a list of problem descriptions:
// min > max, ranges covering the guest (0) or owner (255) ranks, and overlaps.
export function validateRankSyncRules(rules: RankSyncRule[]): string[] {
  const problems: string[] = [];

  for (const rule of rules) {
    if (rule.efMin > rule.efMax) {
      problems.push(`Rule "${rule.efLabel}" has min ${rule.efMin} greater than max ${rule.efMax}.`);
    }
    if (rule.efMin <= 0 || rule.efMax >= 255) {
      problems.push(`Rule "${rule.efLabel}" covers the guest (0) or owner (255) rank.`);
    }
  }

  // Check every pair for overlapping ranges.
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (a.efMin <= b.efMax && b.efMin <= a.efMax) {
        problems.push(`Rules "${a.efLabel}" and "${b.efLabel}" have overlapping ranges.`);
      }
    }
  }

  return problems;
}

// Returns the Corps role names in the table that do not exist in the Corps
// group (compared case-insensitively).
export function findMissingCorpsRoles(
  rules: RankSyncRule[],
  corpsRoles: GroupRole[],
): string[] {
  const existing = new Set(corpsRoles.map((role) => normaliseName(role.name)));
  const missing: string[] = [];
  for (const rule of rules) {
    if (!existing.has(normaliseName(rule.corpsRoleName))) {
      missing.push(rule.corpsRoleName);
    }
  }
  // Remove duplicates while keeping order.
  return [...new Set(missing)];
}
