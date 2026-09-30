import { describe, test, expect } from "vitest";
import {
  findRankRoleId,
  managedRankRoleIds,
  computeRankRoleChange,
} from "./rankRoleService";
import { RANK_ROLES } from "../config/rankRoles";

describe("findRankRoleId", () => {
  test("returns the mapped role for Citoyen (1)", () => {
    expect(findRankRoleId(1)).toBe("1195572029487853576");
  });

  test("returns the mapped role for Colonel (16)", () => {
    expect(findRankRoleId(16)).toBe("1195572029521408032");
  });

  test("returns null for ranks above Colonel (manual)", () => {
    expect(findRankRoleId(17)).toBeNull();
    expect(findRankRoleId(19)).toBeNull();
  });

  test("returns null for the guest and owner ranks", () => {
    expect(findRankRoleId(0)).toBeNull();
    expect(findRankRoleId(255)).toBeNull();
  });

  test("returns the mapped role for Major (15)", () => {
    expect(findRankRoleId(15)).toBe("1195572029508829303");
  });
});

describe("managedRankRoleIds", () => {
  test("matches the role IDs in the map", () => {
    expect(managedRankRoleIds()).toEqual(RANK_ROLES.map((r) => r.discordRoleId));
  });
});

describe("computeRankRoleChange", () => {
  const R = [
    { efRank: 1, discordRoleId: "role-citoyen" },
    { efRank: 6, discordRoleId: "role-sergent" },
    { efRank: 8, discordRoleId: "role-adjudant" },
  ];

  test("adds the new role and removes the old managed rank role", () => {
    const change = computeRankRoleChange(8, ["role-sergent", "other-role"], R);
    expect(change.add).toBe("role-adjudant");
    expect(change.remove).toEqual(["role-sergent"]);
  });

  test("never touches roles outside the managed set", () => {
    const change = computeRankRoleChange(6, ["role-citoyen", "regiment-1", "eagle-bearer"], R);
    expect(change.add).toBe("role-sergent");
    expect(change.remove).toEqual(["role-citoyen"]);
  });

  test("does not remove the new role if the member already has it", () => {
    const change = computeRankRoleChange(6, ["role-sergent"], R);
    expect(change.add).toBe("role-sergent");
    expect(change.remove).toEqual([]);
  });

  test("removes multiple stale managed roles if somehow present", () => {
    const change = computeRankRoleChange(8, ["role-citoyen", "role-sergent"], R);
    expect(change.add).toBe("role-adjudant");
    expect(change.remove.sort()).toEqual(["role-citoyen", "role-sergent"]);
  });

  test("unmapped rank: no add, no remove", () => {
    const change = computeRankRoleChange(99, ["role-sergent"], R);
    expect(change.add).toBeNull();
    expect(change.remove).toEqual([]);
  });
});
