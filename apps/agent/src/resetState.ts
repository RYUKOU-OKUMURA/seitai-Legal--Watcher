import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRepoRoot } from "./paths.js";

export async function resetState(clearRaw: boolean): Promise<void> {
  const root = resolveRepoRoot();
  const statePath = path.join(root, "data", "state.json");
  await writeFile(statePath, "{\n  \"targets\": {}\n}\n", "utf8");

  if (clearRaw) {
    const rawDir = path.join(root, "data", "raw");
    try {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(rawDir);
      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => rm(path.join(rawDir, f))),
      );
    } catch {
      /* raw dir may be empty */
    }
  }
}
