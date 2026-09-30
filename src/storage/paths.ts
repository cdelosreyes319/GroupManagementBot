// storage/paths.ts
// Resolves where the bot keeps its data files. Overridable with DATA_DIR so the
// deployment can point it at a folder that survives redeploys.
import * as path from "path";

// Returns the data directory (DATA_DIR or <cwd>/data).
export function getDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

// Returns the full path of a data file by name.
export function dataFilePath(fileName: string): string {
  return path.join(getDataDir(), fileName);
}
