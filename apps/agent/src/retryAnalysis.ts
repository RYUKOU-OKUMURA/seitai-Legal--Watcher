import { JsonStateStore } from "@seitai-legal-watch/storage";
import { analyzeChange } from "@seitai-legal-watch/llm";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
  loadRawSnapshotForChangeId,
  readLlmLogEntries,
} from "./analysisLogs.js";
import { resolveRepoRoot } from "./paths.js";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";
import { validateReviewDate } from "./reviewStatus.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface RetryAnalysisResult {
  date: string;
  retried: number;
  succeeded: number;
  failed: number;
  skippedAlreadyOk: number;
  skippedMissingRaw: number;
}

function dateOf(iso: string | undefined, timezoneName: string): string | undefined {
  if (!iso) return undefined;
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.tz(timezoneName).format("YYYY-MM-DD") : undefined;
}

export async function retryFailedAnalysesForDate(
  date: string,
  options: { root?: string; timezone?: string } = {},
): Promise<RetryAnalysisResult> {
  const root = options.root ?? resolveRepoRoot();
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const targetDate = validateReviewDate(date);
  const entries = await readLlmLogEntries(root);
  const store = new JsonStateStore(root);
  const now = new Date().toISOString();
  const targetErrors = entries.filter(
    (entry) =>
      entry.status === "error" &&
      entry.changeId &&
      dateOf(entry.at, timezoneName) === targetDate,
  );
  const latestTargetErrorByChangeId = new Map<string, number>();
  for (const entry of targetErrors) {
    latestTargetErrorByChangeId.set(
      entry.changeId!,
      Math.max(latestTargetErrorByChangeId.get(entry.changeId!) ?? -1, entry.lineIndex),
    );
  }
  const errorChangeIds = [...latestTargetErrorByChangeId.keys()].sort();

  let succeeded = 0;
  let failed = 0;
  let skippedAlreadyOk = 0;
  let skippedMissingRaw = 0;

  for (const changeId of errorChangeIds) {
    const errorLine = latestTargetErrorByChangeId.get(changeId) ?? -1;
    const hasLaterOk = entries.some(
      (entry) =>
        entry.changeId === changeId &&
        entry.status === "ok" &&
        entry.lineIndex > errorLine,
    );
    if (hasLaterOk) {
      skippedAlreadyOk += 1;
      continue;
    }
    const raw = await loadRawSnapshotForChangeId(root, changeId);
    if (!raw) {
      skippedMissingRaw += 1;
      continue;
    }
    const change = rawSnapshotToDetectedChange(raw);
    try {
      const analysis = await analyzeChange(change, {
        pass: true,
        reasons: raw.gateReasons ?? [],
      }, { cwd: root });
      await store.appendLlmLog({
        at: now,
        changeId,
        importance: analysis.importance,
        status: "ok",
        analysis,
        retryOf: targetDate,
      });
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await store.appendLlmLog({
        at: now,
        changeId,
        status: "error",
        error: message,
        retryOf: targetDate,
      });
      failed += 1;
    }
  }

  return {
    date: targetDate,
    retried: errorChangeIds.length,
    succeeded,
    failed,
    skippedAlreadyOk,
    skippedMissingRaw,
  };
}
