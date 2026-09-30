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
      statsSources: [],
      usernameAliases: {},
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

  test("refuses to start on a corrupt file without overwriting it", async () => {
    const filePath = path.join(dir, "settings.json");
    await fs.writeFile(filePath, "not json", "utf8");
    await expect(createJsonSettingsStore(filePath)).rejects.toThrow(/Cannot parse/);
    expect(await fs.readFile(filePath, "utf8")).toBe("not json");
  });
});
