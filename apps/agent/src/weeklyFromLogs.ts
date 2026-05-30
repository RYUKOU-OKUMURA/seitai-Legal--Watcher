import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "@seitai-legal-watch/config";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import {
  generateWeeklyReportMarkdown,
  type WeeklyReportEntry,
} from "@seitai-legal-watch/reports";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { resolveRepoRoot, weeklyReportPath } from "./paths.js";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface LlmLogEntry {
  at?: string;
  changeId?: string;
  status?: string;
  analysis?: Analysis;
  lineIndex: number;
}

export interface IsoWeekPeriod {
  week: string;
  startDate: string;
  endDate: string;
}

export interface WeeklyEntriesFromLogs {
  period: IsoWeekPeriod;
  entries: WeeklyReportEntry[];
}

function isoDay(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = addDays(jan4, 1 - isoDay(jan4));
  return addDays(week1Monday, (week - 1) * 7);
}

function weeksInIsoYear(year: number): number {
  const thisYearStart = mondayOfIsoWeek(year, 1);
  const nextYearStart = mondayOfIsoWeek(year + 1, 1);
  return Math.round((nextYearStart.getTime() - thisYearStart.getTime()) / MS_PER_DAY / 7);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoWeekPeriod(weekInput: string): IsoWeekPeriod {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekInput);
  if (!match) {
    throw new Error(`Invalid ISO week: ${weekInput}. Expected format YYYY-Www, e.g. 2026-W22.`);
  }

  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  const maxWeek = weeksInIsoYear(year);
  if (weekNumber < 1 || weekNumber > maxWeek) {
    throw new Error(
      `Invalid ISO week: ${weekInput}. ${year} has ISO weeks 01-${String(maxWeek).padStart(2, "0")}.`,
    );
  }

  const start = mondayOfIsoWeek(year, weekNumber);
  const end = addDays(start, 6);

  return {
    week: `${year}-W${String(weekNumber).padStart(2, "0")}`,
    startDate: formatUtcDate(start),
    endDate: formatUtcDate(end),
  };
}

function isRawInPeriod(
  raw: RawSnapshot,
  period: IsoWeekPeriod,
  timezoneName: string,
): boolean {
  const detected = dayjs(raw.detectedAt);
  if (!detected.isValid()) return false;

  const start = dayjs.tz(`${period.startDate}T00:00:00`, timezoneName);
  const endExclusive = start.add(7, "day");
  const detectedMs = detected.valueOf();

  return detectedMs >= start.valueOf() && detectedMs < endExclusive.valueOf();
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

async function readJsonl(filePath: string): Promise<LlmLogEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if (isNodeErrnoException(err) && err.code === "ENOENT") return [];
    throw err;
  }

  const entries: LlmLogEntry[] = [];
  for (const [lineIndex, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      entries.push({
        ...(JSON.parse(line) as Omit<LlmLogEntry, "lineIndex">),
        lineIndex,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSONL at ${filePath}:${lineIndex + 1}: ${message}`);
    }
  }
  return entries;
}

async function loadRawSnapshots(root: string): Promise<RawSnapshot[]> {
  const rawDir = path.join(root, "data", "raw");
  let files: string[] = [];
  try {
    files = await readdir(rawDir);
  } catch {
    return [];
  }

  const snapshots: RawSnapshot[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(path.join(rawDir, file), "utf8")) as RawSnapshot;
    snapshots.push(raw);
  }
  return snapshots;
}

function comparableAnalysisTime(entry: LlmLogEntry): number {
  for (const candidate of [entry.analysis?.analyzedAt, entry.at]) {
    if (!candidate) continue;
    const parsed = dayjs(candidate);
    if (parsed.isValid()) return parsed.valueOf();
  }
  return Number.NEGATIVE_INFINITY;
}

function isLaterAnalysis(candidate: LlmLogEntry, current: LlmLogEntry): boolean {
  const candidateTime = comparableAnalysisTime(candidate);
  const currentTime = comparableAnalysisTime(current);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.lineIndex > current.lineIndex;
}

function latestAnalysesByChangeId(entries: LlmLogEntry[]): Map<string, Analysis> {
  const latest = new Map<string, LlmLogEntry & { analysis: Analysis }>();

  for (const entry of entries) {
    if (entry.status !== "ok" || !entry.analysis) continue;
    const changeId = entry.analysis.changeId || entry.changeId;
    if (!changeId) continue;

    const current = latest.get(changeId);
    if (!current || isLaterAnalysis(entry as LlmLogEntry & { analysis: Analysis }, current)) {
      latest.set(changeId, entry as LlmLogEntry & { analysis: Analysis });
    }
  }

  return new Map(
    [...latest.entries()].map(([changeId, entry]) => [changeId, entry.analysis]),
  );
}

export async function collectWeeklyEntriesFromLogs(
  week: string,
  options: {
    root?: string;
    timezone?: string;
  } = {},
): Promise<WeeklyEntriesFromLogs> {
  const root = options.root ?? resolveRepoRoot();
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const period = isoWeekPeriod(week);

  const rawSnapshots = await loadRawSnapshots(root);
  const rawByChangeId = new Map(rawSnapshots.map((raw) => [raw.changeId, raw]));
  const analyses = latestAnalysesByChangeId(
    await readJsonl(path.join(root, "data", "llm-log.jsonl")),
  );
  const entries: WeeklyReportEntry[] = [];

  for (const [changeId, analysis] of analyses.entries()) {
    const raw = rawByChangeId.get(changeId);
    if (!raw || !isRawInPeriod(raw, period, timezoneName)) continue;
    entries.push({
      analysis,
      change: rawSnapshotToDetectedChange(raw),
      detectedDate: dayjs(raw.detectedAt).tz(timezoneName).format("YYYY-MM-DD HH:mm"),
    });
  }

  return { period, entries };
}

export async function regenerateWeeklyReportFromLogs(week: string): Promise<string> {
  const root = resolveRepoRoot();
  const config = await loadConfig();
  const { period, entries } = await collectWeeklyEntriesFromLogs(week, { root });
  const markdown = generateWeeklyReportMarkdown({
    week: period.week,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    checkpointsHeading: config.display.checkpoints_heading,
    entries,
  });
  const reportPath = weeklyReportPath(root, period.week);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}
