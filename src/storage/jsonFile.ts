// storage/jsonFile.ts
// A generic JSON file store: loads once into memory, creates defaults if
// missing, and saves atomically (temp file then rename) with a single .bak
// copy of the previous version. All writes for one file go through one promise
// chain so they never overlap.
import { promises as fs } from "fs";
import * as path from "path";

// What to do when a file exists but cannot be parsed.
export type CorruptPolicy =
  // Throw and refuse to start; never touch the file (for settings/events).
  | "refuse"
  // Rename the bad file to .corrupt and start fresh (for activity).
  | "reset";

// Options for creating a JSON file store.
export type JsonFileOptions<T> = {
  filePath: string;
  defaults: () => T;
  onCorrupt: CorruptPolicy;
  // Restrict the file to owner-only (0o600) where the OS supports it.
  restrictPermissions?: boolean;
  // Adjusts a freshly parsed file before use, e.g. to fill keys that an older
  // version of the file does not have yet. The file itself is not rewritten.
  normalise?: (parsed: T) => T;
};

// A loaded JSON file with in-memory reads and atomic, queued writes.
export type JsonFileStore<T> = {
  get(): Readonly<T>;
  update(change: (draft: T) => void): Promise<void>;
};

// Loads (or creates) a JSON file and returns a store over it.
export async function createJsonFileStore<T>(
  options: JsonFileOptions<T>,
): Promise<JsonFileStore<T>> {
  let data = await loadOrCreate(options);

  // One promise chain per file so two writes never run at the same time.
  let writeChain: Promise<void> = Promise.resolve();

  function get(): Readonly<T> {
    return data;
  }

  // Applies a change to a clone, then saves it atomically. Only the in-memory
  // copy is swapped once the write succeeds.
  function update(change: (draft: T) => void): Promise<void> {
    writeChain = writeChain.then(async () => {
      const draft = structuredClone(data);
      change(draft);
      await atomicSave(options, draft);
      data = draft;
    });
    return writeChain;
  }

  return { get, update };
}

// Reads and parses the file, creating it with defaults when missing and
// applying the corrupt policy when it cannot be parsed.
async function loadOrCreate<T>(options: JsonFileOptions<T>): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(options.filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      const defaults = options.defaults();
      await atomicSave(options, defaults);
      return defaults;
    }
    throw error;
  }

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    if (options.onCorrupt === "refuse") {
      throw new Error(
        `Cannot parse ${options.filePath}. Fix or remove the file; it will not be overwritten.`,
      );
    }
    // reset: preserve the bad file for inspection, then start fresh.
    await fs.rename(options.filePath, `${options.filePath}.corrupt`).catch(() => undefined);
    const defaults = options.defaults();
    await atomicSave(options, defaults);
    return defaults;
  }
  return options.normalise ? options.normalise(parsed) : parsed;
}

// Writes to <file>.tmp, copies the current file to <file>.bak, then renames tmp
// over the real file so a crash never leaves a half-written file.
async function atomicSave<T>(options: JsonFileOptions<T>, value: T): Promise<void> {
  const { filePath } = options;
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  const bakPath = `${filePath}.bak`;
  const json = JSON.stringify(value, null, 2);

  const writeMode = options.restrictPermissions ? 0o600 : undefined;
  await fs.writeFile(tmpPath, json, { encoding: "utf8", mode: writeMode });

  // Keep one backup of the previous version (ignore if there is none yet).
  await fs.copyFile(filePath, bakPath).catch(() => undefined);

  await fs.rename(tmpPath, filePath);

  if (options.restrictPermissions) {
    await fs.chmod(filePath, 0o600).catch(() => undefined);
  }
}

// True when an error is a "file not found" error.
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
