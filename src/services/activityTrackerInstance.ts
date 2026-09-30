// services/activityTrackerInstance.ts
// Wires the activity tracker to activity.json (corrupt file resets to empty,
// because losing activity history is harmless) and exposes a single instance.
import { createJsonFileStore } from "../storage/jsonFile";
import { dataFilePath } from "../storage/paths";
import { defaultActivityFile, type ActivityFile } from "../storage/types";
import { createActivityTracker, type ActivityTracker } from "./activityTracker";

let instance: ActivityTracker | null = null;

// Builds and stores the shared activity tracker (called once at startup).
export async function configureActivityTracker(
  filePath: string = dataFilePath("activity.json"),
): Promise<ActivityTracker> {
  const store = await createJsonFileStore<ActivityFile>({
    filePath,
    defaults: defaultActivityFile,
    onCorrupt: "reset",
  });
  instance = createActivityTracker(store);
  return instance;
}

// Returns the shared activity tracker, throwing if it was never configured.
export function getActivityTracker(): ActivityTracker {
  if (!instance) {
    throw new Error("Activity tracker used before it was configured.");
  }
  return instance;
}
