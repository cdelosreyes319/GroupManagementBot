import { describe, test, expect, vi } from "vitest";
import { createRankService, type RankServiceDeps } from "./rankService";
import { MANAGED_GROUPS } from "../config/constants";
import type { GroupRole } from "../api/roblox";

const EF_ID = MANAGED_GROUPS.find((g) => g.key === "main")!.id;
const CORPS_ID = MANAGED_GROUPS.find((g) => g.key === "corps")!.id;
const BOT_ID = 999;
const TARGET_ID = 42;

// EF roles use the real rank numbers. Sergent (6) is in the sync rule 6–9 that
// maps to the Corps "Sous-Officier" role.
const EF_ROLES: GroupRole[] = [
  { id: 1, name: "Citoyen", rank: 1 },
  { id: 2, name: "Soldat", rank: 3 },
  { id: 3, name: "Sergent", rank: 6 },
  { id: 4, name: "Adjudant", rank: 8 },
  { id: 5, name: "Maréchal", rank: 19 },
];

// Corps roles use the real rank numbers. "Sous-Officier" is rank 7.
const CORPS_ROLES: GroupRole[] = [
  { id: 10, name: "Militaire du Rang", rank: 1 },
  { id: 11, name: "Vétéran", rank: 3 },
  { id: 12, name: "Sous-Officier", rank: 7 },
];

// Builds rank service deps with configurable current ranks per (group,user).
function makeDeps(ranks: Record<string, number>, corpsRoles: GroupRole[] = CORPS_ROLES) {
  const setRank = vi.fn(async () => undefined);
  const deps: RankServiceDeps = {
    getBotUserId: () => BOT_ID,
    getRankInGroup: vi.fn(async (groupId: number, userId: number) => {
      return ranks[`${groupId}:${userId}`] ?? 0;
    }),
    getGroupRoles: vi.fn(async (groupId: number) =>
      groupId === EF_ID ? EF_ROLES : corpsRoles,
    ),
    setRank,
  };
  return { deps, setRank };
}

describe("setRankWithSync — refusals", () => {
  test("refuses when the target is not in the group", async () => {
    const { deps } = makeDeps({ [`${EF_ID}:${BOT_ID}`]: 200, [`${EF_ID}:${TARGET_ID}`]: 0 });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6,
      syncCorps: true,
    });
    expect(result).toHaveProperty("refused");
  });

  test("refuses a rank at or above the bot", async () => {
    const { deps } = makeDeps({ [`${EF_ID}:${BOT_ID}`]: 6, [`${EF_ID}:${TARGET_ID}`]: 3 });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 8,
      syncCorps: true,
    });
    expect(result).toHaveProperty("refused");
  });

  test("no change when the target already holds the rank", async () => {
    const { deps, setRank } = makeDeps({
      [`${EF_ID}:${BOT_ID}`]: 200,
      [`${EF_ID}:${TARGET_ID}`]: 6,
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6,
      syncCorps: true,
    });
    expect(result).toMatchObject({ main: { changed: false } });
    expect(setRank).not.toHaveBeenCalled();
  });
});

describe("setRankWithSync — Corps sync outcomes", () => {
  test("off when syncCorps is false", async () => {
    const { deps } = makeDeps({
      [`${EF_ID}:${BOT_ID}`]: 200,
      [`${EF_ID}:${TARGET_ID}`]: 3,
      [`${CORPS_ID}:${TARGET_ID}`]: 1,
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6,
      syncCorps: false,
    });
    expect(result).toMatchObject({ corps: { status: "off" } });
  });

  test("off when ranking directly in Neuvième Corps (never touches EF)", async () => {
    const { deps, setRank } = makeDeps({
      [`${CORPS_ID}:${BOT_ID}`]: 200,
      [`${CORPS_ID}:${TARGET_ID}`]: 1,
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "corps",
      newRank: 7,
      syncCorps: true,
    });
    expect(result).toMatchObject({ corps: { status: "off" } });
    // Only the Corps setRank happened, never an EF one.
    expect(setRank).toHaveBeenCalledTimes(1);
    expect(setRank).toHaveBeenCalledWith(CORPS_ID, TARGET_ID, 7);
  });

  test("no_rule when the new EF rank matches no sync rule", async () => {
    // Maréchal (19) is above Colonel, so it has no sync rule; Corps is left alone.
    const { deps } = makeDeps({
      [`${EF_ID}:${BOT_ID}`]: 254,
      [`${EF_ID}:${TARGET_ID}`]: 3,
      [`${CORPS_ID}:${TARGET_ID}`]: 1,
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 19,
      syncCorps: true,
    });
    expect(result).toMatchObject({ corps: { status: "no_rule" } });
  });

  test("not_member when the target is not in the Corps", async () => {
    const { deps } = makeDeps({
      [`${EF_ID}:${BOT_ID}`]: 200,
      [`${EF_ID}:${TARGET_ID}`]: 3,
      [`${CORPS_ID}:${TARGET_ID}`]: 0,
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6, // Sergent -> Sous-Officier
      syncCorps: true,
    });
    expect(result).toMatchObject({ corps: { status: "not_member" } });
  });

  test("changed when the Corps rank is updated", async () => {
    const { deps, setRank } = makeDeps({
      [`${EF_ID}:${BOT_ID}`]: 200,
      [`${EF_ID}:${TARGET_ID}`]: 3,
      [`${CORPS_ID}:${BOT_ID}`]: 200,
      [`${CORPS_ID}:${TARGET_ID}`]: 1, // currently Militaire du Rang
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6, // EF Sergent -> rule Sous-Officier (corps rank 7)
      syncCorps: true,
    });
    expect(result).toMatchObject({
      main: { changed: true },
      corps: { status: "changed", newRankName: "Sous-Officier" },
    });
    // EF change + Corps change both happened.
    expect(setRank).toHaveBeenCalledWith(EF_ID, TARGET_ID, 6);
    expect(setRank).toHaveBeenCalledWith(CORPS_ID, TARGET_ID, 7);
  });

  test("unchanged when the Corps rank already matches", async () => {
    const { deps } = makeDeps({
      [`${EF_ID}:${BOT_ID}`]: 200,
      [`${EF_ID}:${TARGET_ID}`]: 3,
      [`${CORPS_ID}:${BOT_ID}`]: 200,
      [`${CORPS_ID}:${TARGET_ID}`]: 7, // already Sous-Officier
    });
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6,
      syncCorps: true,
    });
    expect(result).toMatchObject({ corps: { status: "unchanged", rankName: "Sous-Officier" } });
  });

  test("failed keeps the EF change when the Corps role is missing", async () => {
    const { deps, setRank } = makeDeps(
      {
        [`${EF_ID}:${BOT_ID}`]: 200,
        [`${EF_ID}:${TARGET_ID}`]: 3,
        [`${CORPS_ID}:${TARGET_ID}`]: 1,
      },
      [{ id: 10, name: "Militaire du Rang", rank: 1 }], // corps has no Sous-Officier role
    );
    const service = createRankService(deps);
    const result = await service.setRankWithSync({
      robloxUserId: TARGET_ID,
      groupKey: "main",
      newRank: 6, // needs Sous-Officier, which is missing
      syncCorps: true,
    });
    expect(result).toMatchObject({ main: { changed: true }, corps: { status: "failed" } });
    // EF change still happened despite Corps failure.
    expect(setRank).toHaveBeenCalledWith(EF_ID, TARGET_ID, 6);
  });
});
