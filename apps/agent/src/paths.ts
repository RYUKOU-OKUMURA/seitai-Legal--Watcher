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

export function weeklyReportPath(root: string, week: string): string {
  return path.join(root, "reports", "weekly", `${week}_legal_watch.md`);
}

export function checklistReportPath(root: string, date: string): string {
  return path.join(root, "reports", "checklists", `${date}_ad_checklist.md`);
}

export function manualImpactReportPath(root: string, date: string): string {
  return path.join(root, "reports", "manual-impact", `${date}_manual_impact.md`);
}

export function practicalDraftReportPath(root: string, date: string): string {
  return path.join(root, "reports", "drafts", `${date}_practical_drafts.md`);
}

export function watchDbPath(root: string): string {
  return path.join(root, "data", "watch.db");
}
