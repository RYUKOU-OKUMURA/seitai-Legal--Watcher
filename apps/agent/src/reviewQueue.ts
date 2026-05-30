import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  REVIEW_QUEUE_STATUSES,
  generateReviewQueueMarkdown,
  type ReviewQueueReportEntry,
} from "@seitai-legal-watch/reports";
import type { ReviewItem } from "@seitai-legal-watch/storage";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { reviewQueueReportPath, resolveRepoRoot } from "./paths.js";
import { listReviewItems, validateReviewDate } from "./reviewStatus.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface ReviewQueueOptions {
  root?: string;
  dbPath?: string;
  date?: string;
  timezone?: string;
}

export interface ReviewQueueResult {
  date: string;
  entries: ReviewQueueReportEntry[];
}

const queueStatuses = new Set<string>(REVIEW_QUEUE_STATUSES);
const statusOrder = new Map<string, number>(
  REVIEW_QUEUE_STATUSES.map((status, index) => [status, index]),
);
const importanceOrder: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function today(timezoneName: string): string {
  return dayjs().tz(timezoneName).format("YYYY-MM-DD");
}

function toReportEntry(item: ReviewItem): ReviewQueueReportEntry | undefined {
  if (!queueStatuses.has(item.status)) return undefined;
  return {
    analysisId: item.analysisId,
    changeId: item.changeId,
    status: item.status as ReviewQueueReportEntry["status"],
    importance: item.importance,
    category: item.category,
    title: item.title,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    detectedAt: item.detectedAt,
    detectedDate: item.detectedDate,
    summary: item.summary,
    impact: item.impact,
    adImpact: item.adImpact,
    operatorCheckpoints: item.operatorCheckpoints,
    needsOriginalCheck: item.needsOriginalCheck,
    needsLocalGovernmentCheck: item.needsLocalGovernmentCheck,
    needsExpertReview: item.needsExpertReview,
    unknowns: item.unknowns,
    note: item.note,
  };
}

function sortEntries(entries: ReviewQueueReportEntry[]): ReviewQueueReportEntry[] {
  return [...entries].sort((a, b) => {
    const byStatus = (statusOrder.get(a.status) ?? 99) - (statusOrder.get(b.status) ?? 99);
    if (byStatus !== 0) return byStatus;

    const byImportance = (importanceOrder[a.importance] ?? 9) - (importanceOrder[b.importance] ?? 9);
    if (byImportance !== 0) return byImportance;

    const byExpert = Number(b.needsExpertReview) - Number(a.needsExpertReview);
    if (byExpert !== 0) return byExpert;

    return (a.detectedAt ?? "").localeCompare(b.detectedAt ?? "");
  });
}

export async function collectReviewQueueEntries(
  options: ReviewQueueOptions = {},
): Promise<ReviewQueueResult> {
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const date = options.date ? validateReviewDate(options.date) : today(timezoneName);
  const items = await listReviewItems({
    root: options.root,
    dbPath: options.dbPath,
    date,
    latestOnly: true,
  });

  return {
    date,
    entries: sortEntries(
      items.flatMap((item) => {
        const entry = toReportEntry(item);
        return entry ? [entry] : [];
      }),
    ),
  };
}

export async function writeReviewQueueMarkdown(
  result: ReviewQueueResult,
  options: { root?: string } = {},
): Promise<string> {
  const root = options.root ?? resolveRepoRoot();
  const markdown = generateReviewQueueMarkdown(result);
  const reportPath = reviewQueueReportPath(root, result.date);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}

export async function regenerateReviewQueueFromDb(
  date?: string,
  options: Omit<ReviewQueueOptions, "date"> = {},
): Promise<string> {
  const root = options.root ?? resolveRepoRoot();
  const result = await collectReviewQueueEntries({
    ...options,
    root,
    date,
  });
  return writeReviewQueueMarkdown(result, { root });
}

export function formatReviewQueueResult(result: ReviewQueueResult): string {
  const counts = new Map<string, number>();
  for (const status of REVIEW_QUEUE_STATUSES) counts.set(status, 0);
  for (const entry of result.entries) {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  }

  const lines = [
    `Review queue for ${result.date}`,
    "status\tcount",
    ...REVIEW_QUEUE_STATUSES.map((status) => `${status}\t${counts.get(status) ?? 0}`),
    "",
  ];

  if (result.entries.length === 0) {
    lines.push("No review queue items.");
    return lines.join("\n");
  }

  lines.push("analysisId\tchangeId\tstatus\timportance\ttitle");
  for (const entry of result.entries) {
    lines.push(
      [
        entry.analysisId,
        entry.changeId,
        entry.status,
        entry.importance,
        entry.title ?? entry.summary,
      ].join("\t"),
    );
  }
  return lines.join("\n");
}
