import { describe, test, expect } from "vitest";
import { isAllowed, createPermissionService } from "./permissionService";
import type { SettingsStore } from "../storage/settingsStore";
import { defaultSettings, type Settings } from "../storage/types";

const GUILD = "guild-1";

// A minimal in-memory settings store for the add/remove/reset tests.
function fakeStore(): SettingsStore {
  let settings: Settings = defaultSettings();
  return {
    get: () => settings,
    update: async (change) => {
      const draft = structuredClone(settings);
      change(draft);
      settings = draft;
    },
  };
}

describe("isAllowed (pure rule)", () => {
  test("public is always allowed", () => {
    expect(
      isAllowed({
        access: "public",
        allowedRoleIds: [],
        memberRoleIds: [],
        isAdmin: false,
        guildId: GUILD,
      }),
    ).toBe(true);
  });

  test("administrators may run configurable commands", () => {
    expect(
      isAllowed({
        access: "configurable",
        allowedRoleIds: [],
        memberRoleIds: [],
        isAdmin: true,
        guildId: GUILD,
      }),
    ).toBe(true);
  });

  test("admin-level commands are denied to non-admins", () => {
    expect(
      isAllowed({
        access: "admin",
        allowedRoleIds: [],
        memberRoleIds: ["r1"],
        isAdmin: false,
        guildId: GUILD,
      }),
    ).toBe(false);
  });

  test("configurable fails closed with no allowed roles", () => {
    expect(
      isAllowed({
        access: "configurable",
        allowedRoleIds: [],
        memberRoleIds: ["r1"],
        isAdmin: false,
        guildId: GUILD,
      }),
    ).toBe(false);
  });

  test("configurable allowed when member holds an allowed role", () => {
    expect(
      isAllowed({
        access: "configurable",
        allowedRoleIds: ["r2"],
        memberRoleIds: ["r1", "r2"],
        isAdmin: false,
        guildId: GUILD,
      }),
    ).toBe(true);
  });

  test("configurable denied when member holds none of the allowed roles", () => {
    expect(
      isAllowed({
        access: "configurable",
        allowedRoleIds: ["r2"],
        memberRoleIds: ["r1"],
        isAdmin: false,
        guildId: GUILD,
      }),
    ).toBe(false);
  });

  test("@everyone (guild ID in the list) opens the command to all", () => {
    expect(
      isAllowed({
        access: "configurable",
        allowedRoleIds: [GUILD],
        memberRoleIds: ["r9"],
        isAdmin: false,
        guildId: GUILD,
      }),
    ).toBe(true);
  });
});

describe("permission service role management", () => {
  test("addRole then listRoles for a configurable command", async () => {
    const service = createPermissionService(fakeStore());
    await service.addRole("accept", "r1");
    expect(service.listRoles("accept")).toEqual(["r1"]);
  });

  test("addRole is idempotent", async () => {
    const service = createPermissionService(fakeStore());
    await service.addRole("accept", "r1");
    await service.addRole("accept", "r1");
    expect(service.listRoles("accept")).toEqual(["r1"]);
  });

  test("removeRole drops a role", async () => {
    const service = createPermissionService(fakeStore());
    await service.addRole("accept", "r1");
    await service.addRole("accept", "r2");
    await service.removeRole("accept", "r1");
    expect(service.listRoles("accept")).toEqual(["r2"]);
  });

  test("resetCommand clears the list", async () => {
    const service = createPermissionService(fakeStore());
    await service.addRole("accept", "r1");
    await service.resetCommand("accept");
    expect(service.listRoles("accept")).toEqual([]);
  });

  test("rejects a non-configurable command name", async () => {
    const service = createPermissionService(fakeStore());
    await expect(service.addRole("ping", "r1")).rejects.toThrow(/not a configurable command/);
  });
});
