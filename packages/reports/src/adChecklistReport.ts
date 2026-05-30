import { IMPORTANCE_ORDER } from "@seitai-legal-watch/core";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";

export interface AdChecklistReportEntry {
  analysis: Analysis;
  change: DetectedChange;
  detectedDate: string;
  selectionReasons: string[];
}

export interface AdChecklistReportInput {
  date: string;
  entries: AdChecklistReportEntry[];
}

const FIXED_AD_CHECKPOINTS = [
  "「治る」と断定していないか",
  "「必ず改善」と保証していないか",
  "医療機関と誤認される表現がないか",
  "国家資格の有無を誤認させていないか",
  "ビフォーアフターが過度な効果保証に見えないか",
  "口コミ表示に不自然な誘導がないか",
  "No.1 表示の根拠が明確か",
  "期間限定・割引表示に誤認がないか",
];

function importanceRank(analysis: Analysis): number {
  return IMPORTANCE_ORDER[analysis.importance] ?? 9;
}

function sortEntries(entries: AdChecklistReportEntry[]): AdChecklistReportEntry[] {
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

function entryTitle(entry: AdChecklistReportEntry): string {
  return entry.change.title || entry.analysis.summary;
}

function sourceUrl(entry: AdChecklistReportEntry): string {
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

function appendHeader(lines: string[], input: AdChecklistReportInput): void {
  lines.push(
    "---",
    "type: legal-watch-ad-checklist",
    `date: ${input.date}`,
    `target_count: ${input.entries.length}`,
    "---",
    "",
    "# 広告・LP・SNSチェックリスト",
    "",
    `対象日: ${input.date}`,
    "",
  );
}

function appendTargetEntries(
  lines: string[],
  sorted: AdChecklistReportEntry[],
): void {
  lines.push("## 1. 対象更新", "");

  if (sorted.length === 0) {
    lines.push(
      "対象日に広告・LP・SNS表現の確認対象として抽出した Analysis はありません。",
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
      "",
      "**更新概要**",
      "",
      entry.analysis.summary,
      "",
      "**実務影響（要確認）**",
      "",
      entry.analysis.impact,
      "",
      "**広告・LP・SNSへの影響**",
      "",
      entry.analysis.adImpact,
      "",
      "**更新由来の確認項目**",
      "",
    );

    if (updateCheckpoints.length === 0) {
      lines.push("- [ ] 原典と実際の広告・LP・SNS表現を照合する");
    } else {
      for (const checkpoint of updateCheckpoints) {
        lines.push(`- [ ] ${checkpoint}`);
      }
    }

    lines.push("", "**固定確認観点**", "");
    for (const checkpoint of FIXED_AD_CHECKPOINTS) {
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

function appendSources(lines: string[], sorted: AdChecklistReportEntry[]): void {
  lines.push("## 2. 原典一覧", "");

  if (sorted.length === 0) {
    lines.push("対象日に広告・LP・SNSチェックリストへ紐づく原典はありません。", "");
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
    "※ 本チェックリストは自動生成です。法的判断の断定ではありません。原典と実際の表示内容を確認してください。",
    "",
  );
}

export function generateAdChecklistMarkdown(input: AdChecklistReportInput): string {
  const sorted = sortEntries(input.entries);
  const lines: string[] = [];

  appendHeader(lines, input);
  appendTargetEntries(lines, sorted);
  appendSources(lines, sorted);
  appendFooter(lines);

  return lines.join("\n");
}
