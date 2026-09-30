// storage/settingsStore.ts
// A small interface over the settings so commands do not touch the file layer
// directly, and so the storage could later be swapped for a database.
import { createJsonFileStore } from "./jsonFile";
import { dataFilePath } from "./paths";
import { defaultSettings, type Settings } from "./types";

// The read/update surface the rest of the code uses for settings.
export interface SettingsStore {
  get(): Readonly<Settings>;
  update(change: (draft: Settings) => void): Promise<void>;
}

// Creates a JSON-backed settings store. settings.json is written owner-only and
// refuses to start if it cannot be parsed (it holds endpoint secrets).
export async function createJsonSettingsStore(
  filePath: string = dataFilePath("settings.json"),
): Promise<SettingsStore> {
  const store = await createJsonFileStore<Settings>({
    filePath,
    defaults: defaultSettings,
    onCorrupt: "refuse",
    restrictPermissions: true,
  });
  return {
    get: () => store.get(),
    update: (change) => store.update(change),
  };
}
