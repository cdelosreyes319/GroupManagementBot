import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { createJsonSettingsStore } from "./settingsStore";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "settings-test-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("createJsonSettingsStore", () => {
  test("starts with safe defaults", async () => {
    const store = await createJsonSettingsStore(path.join(dir, "settings.json"));
    expect(store.get()).toEqual({
      version: 1,
      commandRoles: {},
      eventDmExcludedRoleIds: [],
      eventDmBlacklist: [],
      statsSources: [],
      usernameAliases: {},
      regiments: [],
      specialAssignments: [],
      imperialHonours: [],
      logChannelId: null,
    });
  });

  test("saves and reloads a change", async () => {
    const filePath = path.join(dir, "settings.json");
    const store = await createJsonSettingsStore(filePath);
    await store.update((draft) => {
      draft.commandRoles["rank"] = ["role-1"];
    });

    const reopened = await createJsonSettingsStore(filePath);
    expect(reopened.get().commandRoles["rank"]).toEqual(["role-1"]);
  });

  test("fills keys missing from an older settings.json with defaults", async () => {
    // A file written before later features added eventDmBlacklist, the role
    // lists, and logChannelId.
    const filePath = path.join(dir, "settings.json");
    const oldFile = {
      version: 1,
      commandRoles: { rank: ["role-1"] },
      eventDmExcludedRoleIds: ["role-2"],
      statsSources: [],
      usernameAliases: {},
    };
    await fs.writeFile(filePath, JSON.stringify(oldFile), "utf8");

    const store = await createJsonSettingsStore(filePath);
    const settings = store.get();
    expect(settings.eventDmBlacklist).toEqual([]);
    expect(settings.regiments).toEqual([]);
    expect(settings.specialAssignments).toEqual([]);
    expect(settings.imperialHonours).toEqual([]);
    expect(settings.logChannelId).toBeNull();
    // Existing values are kept as they were.
    expect(settings.commandRoles).toEqual({ rank: ["role-1"] });
    expect(settings.eventDmExcludedRoleIds).toEqual(["role-2"]);
  });

  test("does not rewrite an older file just by loading it", async () => {
    const filePath = path.join(dir, "settings.json");
    const original = JSON.stringify({ version: 1, commandRoles: {} });
    await fs.writeFile(filePath, original, "utf8");

    await createJsonSettingsStore(filePath);
    expect(await fs.readFile(filePath, "utf8")).toBe(original);
  });

  test("saves the filled-in keys on the next update", async () => {
    const filePath = path.join(dir, "settings.json");
    await fs.writeFile(filePath, JSON.stringify({ version: 1, commandRoles: {} }), "utf8");

    const store = await createJsonSettingsStore(filePath);
    await store.update((draft) => {
      draft.eventDmBlacklist.push("user-1");
    });

    const saved = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(saved.eventDmBlacklist).toEqual(["user-1"]);
    expect(saved.logChannelId).toBeNull();
  });

  test("refuses to start on a corrupt file without overwriting it", async () => {
    const filePath = path.join(dir, "settings.json");
    await fs.writeFile(filePath, "not json", "utf8");
    await expect(createJsonSettingsStore(filePath)).rejects.toThrow(/Cannot parse/);
    expect(await fs.readFile(filePath, "utf8")).toBe("not json");
  });
});
