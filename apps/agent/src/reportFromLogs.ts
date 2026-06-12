import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig, resolveKeywordsForSource } from "@seitai-legal-watch/config";
import type { Analysis, DetectedChange, RawSnapshot } from "@seitai-legal-watch/core";
import { ruleGate } from "@seitai-legal-watch/core";
import { generateDailyReportMarkdown } from "@seitai-legal-watch/reports";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { isFetchFailure } from "./changeClassification.js";
import { dailyReportPath, resolveRepoRoot } from "./paths.js";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";

dayjs.extend(utc);
dayjs.extend(timezone);

interface LlmLogEntry {
  at?: string;
  changeId?: string;
  status?: string;
  error?: string;
  analysis?: Analysis;
  retryOf?: string;
}

function dateOf(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format("YYYY-MM-DD");
}

async function readJsonl(filePath: string): Promise<LlmLogEntry[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LlmLogEntry);
  } catch {
    return [];
  }
}

async function loadRawSnapshots(root: string, date: string, tz: string): Promise<RawSnapshot[]> {
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
    if (dateOf(raw.detectedAt, tz) === date) snapshots.push(raw);
  }
  return snapshots;
}

export async function regenerateDailyReportFromLogs(date?: string): Promise<string> {
  const root = resolveRepoRoot();
  const tz = process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const reportDate = date ?? dayjs().tz(tz).format("YYYY-MM-DD");
  const config = await loadConfig();
  const raws = await loadRawSnapshots(root, reportDate, tz);
  const changes = raws.map(rawSnapshotToDetectedChange);
  const changeIds = new Set(changes.map((change) => change.id));
  const llmEntries = (await readJsonl(path.join(root, "data", "llm-log.jsonl"))).filter(
    (entry) =>
      entry.at &&
      entry.changeId &&
      changeIds.has(entry.changeId) &&
      (entry.retryOf ?? dateOf(entry.at, tz)) === reportDate,
  );
  const analyses = llmEntries
    .filter((entry): entry is LlmLogEntry & { analysis: Analysis } => entry.status === "ok" && !!entry.analysis)
    .map((entry) => entry.analysis);
  const analyzedIds = new Set(analyses.map((analysis) => analysis.changeId));
  const analysisFailures = llmEntries
    .filter((entry) => entry.status === "error" && entry.changeId)
    .filter((entry) => !analyzedIds.has(entry.changeId!))
    .map((entry) => ({
      changeId: entry.changeId!,
      error: entry.error ?? "unknown analysis error",
    }));

  const failures = changes.filter(isFetchFailure);
  const gatedOut: DetectedChange[] = [];
  for (const change of changes) {
    if (isFetchFailure(change) || analyzedIds.has(change.id)) continue;
    const source = config.enabledSources.find((s) => s.id === change.sourceId);
    const gate = ruleGate(
      change,
      resolveKeywordsForSource(source, config),
      change.sourceWeight,
      source?.alwaysAnalyze ?? false,
    );
    if (!gate.pass) {
      change.gateReasons = gate.reasons;
      gatedOut.push(change);
    }
  }

  const markdown = generateDailyReportMarkdown({
    date: reportDate,
    checkpointsHeading: config.display.checkpoints_heading,
    result: {
      changes,
      analyses,
      gatedOut,
      failures,
      analysisFailures,
    },
  });
  const reportPath = dailyReportPath(root, reportDate);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}
