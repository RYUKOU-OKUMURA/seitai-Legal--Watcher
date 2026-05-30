import { SqliteStateStore, assertReviewStatus } from "@seitai-legal-watch/storage";
import type { ReviewItem, ReviewStatus } from "@seitai-legal-watch/storage";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
  loadLatestAnalysesByChangeId,
  loadRawSnapshotForChangeId,
} from "./analysisLogs.js";
import { resolveRepoRoot, watchDbPath } from "./paths.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface ReviewImportOptions {
  root?: string;
  dbPath?: string;
  date?: string;
  timezone?: string;
}

export interface ReviewImportResult {
  date?: string;
  dbPath: string;
  imported: number;
  skippedMissingRaw: number;
  skippedOutsideDate: number;
  items: ReviewItem[];
}

export interface ReviewListOptions {
  root?: string;
  dbPath?: string;
  date?: string;
  status?: string;
  latestOnly?: boolean;
}

export interface ReviewStatusUpdateOptions {
  root?: string;
  dbPath?: string;
  analysisId?: string;
  changeId?: string;
  status: string;
  note?: string;
  confirmedBy?: string;
}

export function validateReviewDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date}. Expected YYYY-MM-DD.`);
  }
  const parsed = dayjs(date);
  if (!parsed.isValid() || parsed.format("YYYY-MM-DD") !== date) {
    throw new Error(`Invalid date: ${date}. Expected a real calendar date.`);
  }
  return date;
}

function dateOf(iso: string, timezoneName: string): string {
  return dayjs(iso).tz(timezoneName).format("YYYY-MM-DD");
}

function resolveRootAndDbPath(options: { root?: string; dbPath?: string }): {
  root: string;
  dbPath: string;
} {
  const root = options.root ?? resolveRepoRoot();
  return {
    root,
    dbPath: options.dbPath ?? watchDbPath(root),
  };
}

export async function importLatestAnalysesToReviewDb(
  options: ReviewImportOptions = {},
): Promise<ReviewImportResult> {
  const { root, dbPath } = resolveRootAndDbPath(options);
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const date = options.date ? validateReviewDate(options.date) : undefined;
  const latestAnalyses = await loadLatestAnalysesByChangeId(root);
  const store = new SqliteStateStore(root, { dbPath });
  let skippedMissingRaw = 0;
  let skippedOutsideDate = 0;
  const items: ReviewItem[] = [];

  try {
    const sortedAnalyses = [...latestAnalyses.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [changeId, analysis] of sortedAnalyses) {
      const raw = await loadRawSnapshotForChangeId(root, changeId);
      if (!raw) {
        skippedMissingRaw += 1;
        continue;
      }

      const detectedDate = dateOf(raw.detectedAt, timezoneName);
      if (date && detectedDate !== date) {
        skippedOutsideDate += 1;
        continue;
      }

      items.push(
        store.upsertAnalysis({
          analysis,
          raw,
          detectedDate,
        }),
      );
    }
  } finally {
    store.close();
  }

  return {
    date,
    dbPath,
    imported: items.length,
    skippedMissingRaw,
    skippedOutsideDate,
    items,
  };
}

export async function listReviewItems(
  options: ReviewListOptions = {},
): Promise<ReviewItem[]> {
  const { root, dbPath } = resolveRootAndDbPath(options);
  const date = options.date ? validateReviewDate(options.date) : undefined;
  let status: ReviewStatus | undefined;
  if (options.status) {
    assertReviewStatus(options.status);
    status = options.status;
  }

  const store = new SqliteStateStore(root, { dbPath });
  try {
    return store.listReviewItems({
      date,
      status,
      latestOnly: options.latestOnly,
    });
  } finally {
    store.close();
  }
}

export async function setReviewItemStatus(
  options: ReviewStatusUpdateOptions,
): Promise<ReviewItem> {
  assertReviewStatus(options.status);
  const { root, dbPath } = resolveRootAndDbPath(options);
  const store = new SqliteStateStore(root, { dbPath });
  try {
    return store.setReviewStatus({
      analysisId: options.analysisId,
      changeId: options.changeId,
      status: options.status,
      note: options.note,
      confirmedBy: options.confirmedBy,
    });
  } finally {
    store.close();
  }
}

export function formatReviewItems(items: ReviewItem[]): string {
  if (items.length === 0) return "No review items.";
  const lines = [
    "analysisId\tchangeId\tstatus\timportance\tdetectedDate\ttitle",
    ...items.map((item) =>
      [
        item.analysisId,
        item.changeId,
        item.status,
        item.importance,
        item.detectedDate ?? "",
        item.title ?? item.summary,
      ].join("\t"),
    ),
  ];
  return lines.join("\n");
}
