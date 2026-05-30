import { IMPORTANCE_ORDER } from "@seitai-legal-watch/core";

export const REVIEW_QUEUE_STATUSES = [
  "action_required",
  "expert_review_required",
  "reviewing",
  "new",
] as const;

export type ReviewQueueStatus = (typeof REVIEW_QUEUE_STATUSES)[number];

export interface ReviewQueueReportEntry {
  analysisId: string;
  changeId: string;
  status: ReviewQueueStatus;
  importance: string;
  category: string;
  title?: string;
  sourceName?: string;
  sourceUrl: string;
  detectedAt?: string;
  detectedDate?: string;
  summary: string;
  impact: string;
  adImpact: string;
  operatorCheckpoints: string[];
  needsOriginalCheck: boolean;
  needsLocalGovernmentCheck: boolean;
  needsExpertReview: boolean;
  unknowns: string[];
  note?: string;
}

export interface ReviewQueueReportInput {
  date: string;
  entries: ReviewQueueReportEntry[];
}

const STATUS_LABELS: Record<ReviewQueueStatus, string> = {
  action_required: "対応要",
  expert_review_required: "専門家確認要",
  reviewing: "確認中",
  new: "未確認",
};

const STATUS_ORDER: Record<ReviewQueueStatus, number> = {
  action_required: 0,
  expert_review_required: 1,
  reviewing: 2,
  new: 3,
};

function importanceRank(importance: string): number {
  return IMPORTANCE_ORDER[importance] ?? 9;
}

function sortEntries(entries: ReviewQueueReportEntry[]): ReviewQueueReportEntry[] {
  return [...entries].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;

    const byImportance = importanceRank(a.importance) - importanceRank(b.importance);
    if (byImportance !== 0) return byImportance;

    const byExpert = Number(b.needsExpertReview) - Number(a.needsExpertReview);
    if (byExpert !== 0) return byExpert;

    return (a.detectedAt ?? "").localeCompare(b.detectedAt ?? "");
  });
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function entryTitle(entry: ReviewQueueReportEntry): string {
  return entry.title || entry.summary || "無題";
}

function boolLabel(value: boolean): string {
  return value ? "yes" : "no";
}

function appendHeader(lines: string[], input: ReviewQueueReportInput): void {
  lines.push(
    "---",
    "type: legal-watch-review-queue",
    `date: ${input.date}`,
    `target_count: ${input.entries.length}`,
    "---",
    "",
    "# 確認キュー",
    "",
    `対象日: ${input.date}`,
    "",
    "SQLite `data/watch.db` の確認状態から生成しています。Markdown のチェックボックスや Obsidian の編集内容は状態として読み戻しません。",
    "",
  );
}

function appendSummary(lines: string[], sorted: ReviewQueueReportEntry[]): void {
  const counts = new Map<ReviewQueueStatus, number>();
  for (const status of REVIEW_QUEUE_STATUSES) counts.set(status, 0);
  for (const entry of sorted) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);

  lines.push("## 1. 件数", "", "| 状態 | 件数 |", "|---|---:|");
  for (const status of REVIEW_QUEUE_STATUSES) {
    lines.push(`| ${STATUS_LABELS[status]} | ${counts.get(status) ?? 0} |`);
  }
  lines.push("");
}

function appendQueue(lines: string[], sorted: ReviewQueueReportEntry[]): void {
  lines.push("## 2. 今日確認する項目", "");

  if (sorted.length === 0) {
    lines.push(
      "対象日に確認キューへ表示する項目はありません。",
      "",
      "## 3. 原典一覧",
      "",
      "対象日に確認キューへ紐づく原典はありません。",
      "",
    );
    return;
  }

  for (const entry of sorted) {
    const checkpoints = uniqueNonEmpty(entry.operatorCheckpoints);
    lines.push(
      `### [${STATUS_LABELS[entry.status]} / ${entry.importance}] ${entryTitle(entry)}`,
      "",
      `- analysisId: ${entry.analysisId}`,
      `- changeId: ${entry.changeId}`,
      `- status: ${entry.status}`,
      `- 重要度: ${entry.importance}`,
      `- カテゴリ: ${entry.category}`,
      `- 情報源: ${entry.sourceName ?? "Unknown source"}`,
      `- 原典: ${entry.sourceUrl}`,
      `- detectedAt: ${entry.detectedAt ?? entry.detectedDate ?? "unknown"}`,
      `- needsExpertReview: ${boolLabel(entry.needsExpertReview)}`,
      `- needsOriginalCheck: ${boolLabel(entry.needsOriginalCheck)}`,
      `- needsLocalGovernmentCheck: ${boolLabel(entry.needsLocalGovernmentCheck)}`,
      "",
      "**概要**",
      "",
      entry.summary,
      "",
      "**実務影響**",
      "",
      entry.impact,
      "",
      "**広告・LP・SNS影響**",
      "",
      entry.adImpact,
      "",
      "**確認ポイント**",
      "",
    );

    if (checkpoints.length === 0) {
      lines.push("- [ ] 原典と実務影響を確認する");
    } else {
      for (const checkpoint of checkpoints) {
        lines.push(`- [ ] ${checkpoint}`);
      }
    }

    if (entry.note) {
      lines.push("", "**保存メモ**", "", entry.note);
    }

    const unknowns = uniqueNonEmpty(entry.unknowns);
    if (unknowns.length > 0) {
      lines.push("", "**不明点**", "");
      for (const unknown of unknowns) {
        lines.push(`- ${unknown}`);
      }
    }

    lines.push("");
  }

  lines.push("## 3. 原典一覧", "");
  for (const entry of sorted) {
    lines.push(
      `- ${entry.sourceName ?? "Unknown source"}: ${entryTitle(entry)}`,
      `  - analysisId: ${entry.analysisId}`,
      `  - changeId: ${entry.changeId}`,
      `  - status: ${entry.status}`,
      `  - URL: ${entry.sourceUrl}`,
      "",
    );
  }
}

function appendFooter(lines: string[]): void {
  lines.push(
    "---",
    "",
    "※ 本確認キューは自動生成です。確認状態の正は SQLite `data/watch.db` です。Markdown チェックボックスのオンオフは状態として読み戻しません。",
    "",
  );
}

export function generateReviewQueueMarkdown(input: ReviewQueueReportInput): string {
  const sorted = sortEntries(input.entries);
  const lines: string[] = [];

  appendHeader(lines, input);
  appendSummary(lines, sorted);
  appendQueue(lines, sorted);
  appendFooter(lines);

  return lines.join("\n");
}
