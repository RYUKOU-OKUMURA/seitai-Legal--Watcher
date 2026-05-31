import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import dayjs from "dayjs";

export interface LlmLogEntry {
  at?: string;
  changeId?: string;
  status?: string;
  analysis?: Analysis;
  lineIndex: number;
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

export async function readLlmLogEntries(root: string): Promise<LlmLogEntry[]> {
  const filePath = path.join(root, "data", "llm-log.jsonl");
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

export async function loadRawSnapshots(root: string): Promise<RawSnapshot[]> {
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

export async function loadRawSnapshotForChangeId(
  root: string,
  changeId: string,
): Promise<RawSnapshot | undefined> {
  const fileName = `${changeId}.json`;
  if (path.basename(fileName) !== fileName) {
    throw new Error(`Invalid changeId for raw snapshot path: ${changeId}`);
  }

  const filePath = path.join(root, "data", "raw", fileName);
  let rawText: string;
  try {
    rawText = await readFile(filePath, "utf8");
  } catch (err) {
    if (isNodeErrnoException(err) && err.code === "ENOENT") return undefined;
    throw err;
  }

  const raw = JSON.parse(rawText) as RawSnapshot;
  return raw.changeId === changeId ? raw : undefined;
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

export function latestAnalysesByChangeId(
  entries: LlmLogEntry[],
): Map<string, Analysis> {
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

export async function loadLatestAnalysesByChangeId(
  root: string,
): Promise<Map<string, Analysis>> {
  return latestAnalysesByChangeId(await readLlmLogEntries(root));
}
