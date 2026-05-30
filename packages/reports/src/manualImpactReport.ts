import { IMPORTANCE_ORDER } from "@seitai-legal-watch/core";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";

export interface ManualImpactReportEntry {
  analysis: Analysis;
  change: DetectedChange;
  detectedDate: string;
  selectionReasons: string[];
  manualReviewAreas: string[];
}

export interface ManualImpactReportInput {
  date: string;
  entries: ManualImpactReportEntry[];
}

const FIXED_MANUAL_CHECKPOINTS = [
  "該当する院内資料・マニュアル・掲示物を洗い出す",
  "受付説明やスタッフ説明の現行文言と原典を照合する",
  "問診票・同意書・リスク説明への反映要否を確認する",
  "料金表・返金・解約説明への反映要否を確認する",
  "療養費・受領委任・請求フローへの反映要否を確認する",
  "変更する場合の院内共有日・適用開始日を決める",
  "専門家確認が必要な論点を切り分ける",
];

function importanceRank(analysis: Analysis): number {
  return IMPORTANCE_ORDER[analysis.importance] ?? 9;
}

function sortEntries(entries: ManualImpactReportEntry[]): ManualImpactReportEntry[] {
  return [...entries].sort((a, b) => {
    const byImportance = importanceRank(a.analysis) - importanceRank(b.analysis);
    if (byImportance !== 0) return byImportance;

    const byExpert =
      Number(b.analysis.needsExpertReview) - Number(a.analysis.needsExpertReview);
    if (byExpert !== 0) return byExpert;

    const byOriginal =
      Number(b.analysis.needsOriginalCheck) - Number(a.analysis.needsOriginalCheck);
    if (byOriginal !== 0) return byOriginal;

    return a.change.detectedAt.localeCompare(b.change.detectedAt);
  });
}

function entryTitle(entry: ManualImpactReportEntry): string {
  return entry.change.title || entry.analysis.summary;
}

function sourceUrl(entry: ManualImpactReportEntry): string {
  return entry.analysis.sourceUrl || entry.change.url;
}

function listValue(values: string[]): string {
  return values.length > 0 ? values.join("、") : "未分類";
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

function appendHeader(lines: string[], input: ManualImpactReportInput): void {
  lines.push(
    "---",
    "type: legal-watch-manual-impact",
    `date: ${input.date}`,
    `target_count: ${input.entries.length}`,
    "---",
    "",
    "# 院内マニュアル影響確認",
    "",
    `対象日: ${input.date}`,
    "",
  );
}

function appendTargetEntries(
  lines: string[],
  sorted: ManualImpactReportEntry[],
): void {
  lines.push("## 1. 対象更新", "");

  if (sorted.length === 0) {
    lines.push(
      "対象日に院内マニュアル影響確認へ紐づく Analysis はありません。",
      "",
    );
    return;
  }

  for (const entry of sorted) {
    const updateCheckpoints = uniqueNonEmpty(entry.analysis.operator_checkpoints);
    lines.push(
      `### [${entry.analysis.importance}] ${entryTitle(entry)}`,
      "",
      `- 情報源: ${entry.change.sourceName}`,
      `- 原典: ${sourceUrl(entry)}`,
      `- changeId: ${entry.analysis.changeId}`,
      `- detectedAt: ${entry.detectedDate}`,
      `- カテゴリ: ${entry.analysis.category}`,
      `- 対象業態: ${listValue(entry.analysis.targetBusiness)}`,
      `- 抽出理由: ${listValue(entry.selectionReasons)}`,
      `- 確認対象分類: ${listValue(entry.manualReviewAreas)}`,
      "",
      "**更新概要**",
      "",
      entry.analysis.summary,
      "",
      "**実務影響（要確認）**",
      "",
      entry.analysis.impact,
      "",
      "**更新由来の確認項目**",
      "",
    );

    if (updateCheckpoints.length === 0) {
      lines.push("- [ ] 原典と院内資料・スタッフ説明・受付対応を照合する");
    } else {
      for (const checkpoint of updateCheckpoints) {
        lines.push(`- [ ] ${checkpoint}`);
      }
    }

    lines.push("", "**固定確認観点**", "");
    for (const checkpoint of FIXED_MANUAL_CHECKPOINTS) {
      lines.push(`- [ ] ${checkpoint}`);
    }

    if (entry.analysis.unknowns.length > 0) {
      lines.push("", "**不明点**", "");
      for (const unknown of uniqueNonEmpty(entry.analysis.unknowns)) {
        lines.push(`- ${unknown}`);
      }
    }

    lines.push("");
  }
}

function appendSources(lines: string[], sorted: ManualImpactReportEntry[]): void {
  lines.push("## 2. 原典一覧", "");

  if (sorted.length === 0) {
    lines.push("対象日に院内マニュアル影響確認へ紐づく原典はありません。", "");
    return;
  }

  for (const entry of sorted) {
    lines.push(
      `- ${entry.change.sourceName}: ${entryTitle(entry)}`,
      `  - changeId: ${entry.analysis.changeId}`,
      `  - URL: ${sourceUrl(entry)}`,
      "",
    );
  }
}

function appendFooter(lines: string[]): void {
  lines.push(
    "---",
    "",
    "※ 本確認用 Markdown は自動生成です。法的判断の断定ではありません。原典と院内資料・運用実態を確認してください。",
    "",
  );
}

export function generateManualImpactMarkdown(input: ManualImpactReportInput): string {
  const sorted = sortEntries(input.entries);
  const lines: string[] = [];

  appendHeader(lines, input);
  appendTargetEntries(lines, sorted);
  appendSources(lines, sorted);
  appendFooter(lines);

  return lines.join("\n");
}
