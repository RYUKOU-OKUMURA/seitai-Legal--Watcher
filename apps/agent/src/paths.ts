import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveRepoRoot(): string {
  if (process.env.LEGAL_WATCH_ROOT) {
    return path.resolve(process.env.LEGAL_WATCH_ROOT);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

export function dailyReportPath(root: string, date: string): string {
  return path.join(root, "reports", "daily", `${date}.md`);
}
