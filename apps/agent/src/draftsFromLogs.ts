import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawSnapshot } from "@seitai-legal-watch/core";
import {
  generatePracticalDraftMarkdown,
  type PracticalDraftReportEntry,
} from "@seitai-legal-watch/reports";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
  loadLatestAnalysesByChangeId,
  loadRawSnapshots,
} from "./analysisLogs.js";
import { practicalDraftReportPath, resolveRepoRoot } from "./paths.js";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface DraftEntriesFromLogs {
  date: string;
  entries: PracticalDraftReportEntry[];
}

function validateDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }
  const parsed = dayjs(date);
  if (!parsed.isValid() || parsed.format("YYYY-MM-DD") !== date) {
    throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }
  return date;
}

function isRawOnDate(raw: RawSnapshot, date: string, timezoneName: string): boolean {
  const detected = dayjs(raw.detectedAt);
  if (!detected.isValid()) return false;
  return detected.tz(timezoneName).format("YYYY-MM-DD") === date;
}

export async function collectDraftEntriesFromLogs(
  dateInput: string,
  options: {
    root?: string;
    timezone?: string;
  } = {},
): Promise<DraftEntriesFromLogs> {
  const date = validateDate(dateInput);
  const root = options.root ?? resolveRepoRoot();
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const rawSnapshots = await loadRawSnapshots(root);
  const rawByChangeId = new Map(rawSnapshots.map((raw) => [raw.changeId, raw]));
  const analyses = await loadLatestAnalysesByChangeId(root);
  const entries: PracticalDraftReportEntry[] = [];

  for (const [changeId, analysis] of analyses.entries()) {
    const raw = rawByChangeId.get(changeId);
    if (!raw || !isRawOnDate(raw, date, timezoneName)) continue;
    entries.push({
      analysis,
      change: rawSnapshotToDetectedChange(raw),
      detectedDate: dayjs(raw.detectedAt).tz(timezoneName).format("YYYY-MM-DD HH:mm"),
    });
  }

  return { date, entries };
}

export async function regeneratePracticalDraftsFromLogs(date: string): Promise<string> {
  const root = resolveRepoRoot();
  const result = await collectDraftEntriesFromLogs(date, { root });
  const markdown = generatePracticalDraftMarkdown(result);
  const reportPath = practicalDraftReportPath(root, result.date);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}
