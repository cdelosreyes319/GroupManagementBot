import { describe, test, expect } from "vitest";
import {
  findSyncRule,
  validateRankSyncRules,
  findMissingCorpsRoles,
} from "./rankSyncService";
import { RANK_SYNC_RULES, type RankSyncRule } from "../config/rankSync";
import type { GroupRole } from "../api/roblox";

const RULES: RankSyncRule[] = [
  { efMin: 1, efMax: 9, efLabel: "A", corpsRoleName: "Recruit" },
  { efMin: 10, efMax: 29, efLabel: "B", corpsRoleName: "Soldier" },
  { efMin: 30, efMax: 59, efLabel: "C", corpsRoleName: "NCO" },
];

describe("findSyncRule", () => {
  test("finds the rule at the lower edge of a range", () => {
    expect(findSyncRule(10, RULES)?.corpsRoleName).toBe("Soldier");
  });

  test("finds the rule at the upper edge of a range", () => {
    expect(findSyncRule(29, RULES)?.corpsRoleName).toBe("Soldier");
  });

  test("finds the rule in the middle of a range", () => {
    expect(findSyncRule(45, RULES)?.corpsRoleName).toBe("NCO");
  });

  test("returns null for a rank in no rule", () => {
    expect(findSyncRule(200, RULES)).toBeNull();
    expect(findSyncRule(0, RULES)).toBeNull();
  });
});

describe("validateRankSyncRules", () => {
  test("the shipped table is valid", () => {
    expect(validateRankSyncRules(RANK_SYNC_RULES)).toEqual([]);
  });

  test("detects min greater than max", () => {
    const bad: RankSyncRule[] = [{ efMin: 20, efMax: 10, efLabel: "Bad", corpsRoleName: "X" }];
    expect(validateRankSyncRules(bad).some((p) => p.includes("greater than max"))).toBe(true);
  });

  test("detects a range covering the guest rank", () => {
    const bad: RankSyncRule[] = [{ efMin: 0, efMax: 5, efLabel: "Guest", corpsRoleName: "X" }];
    expect(validateRankSyncRules(bad).some((p) => p.includes("guest (0) or owner (255)"))).toBe(
      true,
    );
  });

  test("detects a range covering the owner rank", () => {
    const bad: RankSyncRule[] = [{ efMin: 250, efMax: 255, efLabel: "Owner", corpsRoleName: "X" }];
    expect(validateRankSyncRules(bad).some((p) => p.includes("guest (0) or owner (255)"))).toBe(
      true,
    );
  });

  test("detects overlapping ranges", () => {
    const bad: RankSyncRule[] = [
      { efMin: 10, efMax: 30, efLabel: "One", corpsRoleName: "X" },
      { efMin: 25, efMax: 40, efLabel: "Two", corpsRoleName: "Y" },
    ];
    expect(validateRankSyncRules(bad).some((p) => p.includes("overlapping"))).toBe(true);
  });
});

describe("findMissingCorpsRoles", () => {
  const corpsRoles: GroupRole[] = [
    { id: 1, name: "Recruit", rank: 1 },
    { id: 2, name: "soldier", rank: 2 }, // different case on purpose
  ];

  test("reports rules whose Corps role is missing", () => {
    expect(findMissingCorpsRoles(RULES, corpsRoles)).toEqual(["NCO"]);
  });

  test("matches role names case-insensitively", () => {
    const rules: RankSyncRule[] = [{ efMin: 1, efMax: 9, efLabel: "A", corpsRoleName: "SOLDIER" }];
    expect(findMissingCorpsRoles(rules, corpsRoles)).toEqual([]);
  });

  test("returns empty when all roles exist", () => {
    const rules: RankSyncRule[] = [{ efMin: 1, efMax: 9, efLabel: "A", corpsRoleName: "Recruit" }];
    expect(findMissingCorpsRoles(rules, corpsRoles)).toEqual([]);
  });
});
