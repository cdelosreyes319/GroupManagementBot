import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { createJsonFileStore } from "./jsonFile";

type Sample = { version: number; items: string[] };

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "jsonfile-test-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function defaults(): Sample {
  return { version: 1, items: [] };
}

describe("createJsonFileStore", () => {
  test("creates the file with defaults when missing", async () => {
    const filePath = path.join(dir, "sample.json");
    const store = await createJsonFileStore({ filePath, defaults, onCorrupt: "refuse" });
    expect(store.get()).toEqual({ version: 1, items: [] });
    const onDisk = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(onDisk).toEqual({ version: 1, items: [] });
  });

  test("saves a change and reloads it in a new store", async () => {
    const filePath = path.join(dir, "sample.json");
    const store = await createJsonFileStore({ filePath, defaults, onCorrupt: "refuse" });
    await store.update((draft) => {
      draft.items.push("hello");
    });
    expect(store.get().items).toEqual(["hello"]);

    const reopened = await createJsonFileStore({ filePath, defaults, onCorrupt: "refuse" });
    expect(reopened.get().items).toEqual(["hello"]);
  });

  test("writes a .bak copy of the previous version on the second save", async () => {
    const filePath = path.join(dir, "sample.json");
    const store = await createJsonFileStore({ filePath, defaults, onCorrupt: "refuse" });
    await store.update((draft) => draft.items.push("first"));
    await store.update((draft) => draft.items.push("second"));

    const bak = JSON.parse(await fs.readFile(`${filePath}.bak`, "utf8"));
    // The .bak holds the version before the last save.
    expect(bak.items).toEqual(["first"]);
  });

  test("queued writes never overlap or lose updates", async () => {
    const filePath = path.join(dir, "sample.json");
    const store = await createJsonFileStore({ filePath, defaults, onCorrupt: "refuse" });
    await Promise.all([
      store.update((draft) => draft.items.push("a")),
      store.update((draft) => draft.items.push("b")),
      store.update((draft) => draft.items.push("c")),
    ]);
    expect(store.get().items.sort()).toEqual(["a", "b", "c"]);
  });

  test("refuses to start on a corrupt file without overwriting it", async () => {
    const filePath = path.join(dir, "sample.json");
    await fs.writeFile(filePath, "{ not valid json", "utf8");
    await expect(
      createJsonFileStore({ filePath, defaults, onCorrupt: "refuse" }),
    ).rejects.toThrow(/Cannot parse/);
    // The bad file is untouched.
    expect(await fs.readFile(filePath, "utf8")).toBe("{ not valid json");
  });

  test("reset policy renames a corrupt file and starts fresh", async () => {
    const filePath = path.join(dir, "sample.json");
    await fs.writeFile(filePath, "{ broken", "utf8");
    const store = await createJsonFileStore({ filePath, defaults, onCorrupt: "reset" });
    expect(store.get()).toEqual({ version: 1, items: [] });
    expect(await fs.readFile(`${filePath}.corrupt`, "utf8")).toBe("{ broken");
  });
});
