import { IMPORTANCE_ORDER } from "@seitai-legal-watch/core";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";

export interface WeeklyReportEntry {
  analysis: Analysis;
  change: DetectedChange;
  detectedDate: string;
}

export interface WeeklyReportInput {
  week: string;
  periodStart: string;
  periodEnd: string;
  checkpointsHeading: string;
  entries: WeeklyReportEntry[];
}

interface BusinessGroup {
  heading: string;
  matchers: string[];
}

const BUSINESS_GROUPS: BusinessGroup[] = [
  {
    heading: "### 2.1 整骨院・接骨院",
    matchers: ["整骨", "接骨"],
  },
  {
    heading: "### 2.2 整体院",
    matchers: ["整体"],
  },
  {
    heading: "### 2.3 鍼灸・あん摩マッサージ指圧",
    matchers: ["鍼灸", "鍼", "灸", "あん摩", "マッサージ", "指圧"],
  },
];

const REIMBURSEMENT_KEYWORDS = ["療養費", "受領委任", "保険請求", "請求"];
const LOW_AD_IMPACT_PATTERNS = [
  "該当なし",
  "影響なし",
  "特になし",
  "直接改正ではない",
  "直接的な変更示唆",
  "直接的な変更は",
  "直接的な影響",
];

function importanceRank(analysis: Analysis): number {
  return IMPORTANCE_ORDER[analysis.importance] ?? 9;
}

function sortEntries(entries: WeeklyReportEntry[]): WeeklyReportEntry[] {
  return [...entries].sort((a, b) => {
    const byImportance = importanceRank(a.analysis) - importanceRank(b.analysis);
    if (byImportance !== 0) return byImportance;

    const byExpert =
      Number(b.analysis.needsExpertReview) - Number(a.analysis.needsExpertReview);
    if (byExpert !== 0) return byExpert;

    const byOriginal =
      Number(b.analysis.needsOriginalCheck) - Number(a.analysis.needsOriginalCheck);
    if (byOriginal !== 0) return byOriginal;

    const byLocal =
      Number(b.analysis.needsLocalGovernmentCheck) -
      Number(a.analysis.needsLocalGovernmentCheck);
    if (byLocal !== 0) return byLocal;

    return a.change.detectedAt.localeCompare(b.change.detectedAt);
  });
}

function entryTitle(entry: WeeklyReportEntry): string {
  return entry.change.title || entry.analysis.summary;
}

function sourceUrl(entry: WeeklyReportEntry): string {
  return entry.analysis.sourceUrl || entry.change.url;
}

function appendEntrySummary(lines: string[], entry: WeeklyReportEntry): void {
  lines.push(
    `- [${entry.analysis.importance}] ${entryTitle(entry)}`,
    `  - 情報源: ${entry.change.sourceName}`,
    `  - 原典: ${sourceUrl(entry)}`,
    `  - 要約: ${entry.analysis.summary}`,
    `  - 実務影響: ${entry.analysis.impact}`,
  );
}

function appendCompactEntry(lines: string[], entry: WeeklyReportEntry): void {
  lines.push(
    `- [${entry.analysis.importance}] ${entryTitle(entry)}`,
    `  - 原典: ${sourceUrl(entry)}`,
    `  - 影響: ${entry.analysis.impact}`,
  );
}

function matchesBusiness(entry: WeeklyReportEntry, matchers: string[]): boolean {
  return entry.analysis.targetBusiness.some((business) =>
    matchers.some((matcher) => business.includes(matcher)),
  );
}

function hasAnyBusinessGroup(entry: WeeklyReportEntry): boolean {
  return BUSINESS_GROUPS.some((group) => matchesBusiness(entry, group.matchers));
}

function adImpactIsLow(text: string): boolean {
  return LOW_AD_IMPACT_PATTERNS.some((pattern) => text.includes(pattern));
}

function reimbursementText(entry: WeeklyReportEntry): string {
  return [
    entry.analysis.category,
    entry.analysis.summary,
    entry.analysis.impact,
    ...entry.analysis.operator_checkpoints,
  ].join("\n");
}

function matchesReimbursement(entry: WeeklyReportEntry): boolean {
  const text = reimbursementText(entry);
  return REIMBURSEMENT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function appendHeader(lines: string[], input: WeeklyReportInput): void {
  lines.push(
    "---",
    "type: legal-watch-weekly",
    `week: ${input.week}`,
    `period_start: ${input.periodStart}`,
    `period_end: ${input.periodEnd}`,
    `analyzed_count: ${input.entries.length}`,
    "---",
    "",
    "# 整体院・整骨院 Legal Watch Weekly",
    "",
    `対象期間: ${input.periodStart}〜${input.periodEnd}`,
    `対象週: ${input.week}`,
    "",
  );
}

function appendImportantUpdates(lines: string[], sorted: WeeklyReportEntry[]): void {
  lines.push("## 1. 今週の重要更新", "");

  if (sorted.length === 0) {
    lines.push("対象期間内に Analysis 済みの更新はありません。", "");
    return;
  }

  const high = sorted.filter((entry) => entry.analysis.importance === "high");
  const important =
    high.length > 0
      ? high
      : sorted.filter((entry) => entry.analysis.importance === "medium");

  if (important.length === 0) {
    lines.push("高・中重要度の Analysis 済み更新はありません。", "");
    return;
  }

  for (const entry of important) {
    appendEntrySummary(lines, entry);
    lines.push("");
  }
}

function appendBusinessImpacts(lines: string[], sorted: WeeklyReportEntry[]): void {
  lines.push("## 2. 業態別影響", "");

  for (const group of BUSINESS_GROUPS) {
    lines.push(group.heading, "");
    const entries = sorted.filter((entry) => matchesBusiness(entry, group.matchers));
    if (entries.length === 0) {
      lines.push("該当項目はありません。", "");
      continue;
    }
    for (const entry of entries) {
      appendCompactEntry(lines, entry);
      lines.push("");
    }
  }

  const other = sorted.filter((entry) => !hasAnyBusinessGroup(entry));
  if (other.length > 0) {
    lines.push("### 2.4 その他・横断", "");
    for (const entry of other) {
      appendCompactEntry(lines, entry);
      lines.push("");
    }
  }
}

function appendAdImpacts(lines: string[], sorted: WeeklyReportEntry[]): void {
  lines.push("## 3. 広告・LP・SNSへの影響", "");

  if (sorted.length === 0) {
    lines.push("対象期間内の広告・表示影響メモはありません。", "");
    return;
  }

  const entries = [...sorted].sort((a, b) => {
    const byLowImpact =
      Number(adImpactIsLow(a.analysis.adImpact)) -
      Number(adImpactIsLow(b.analysis.adImpact));
    if (byLowImpact !== 0) return byLowImpact;
    return importanceRank(a.analysis) - importanceRank(b.analysis);
  });

  for (const entry of entries) {
    lines.push(
      `- [${entry.analysis.importance}] ${entryTitle(entry)}`,
      `  - ${entry.analysis.adImpact}`,
      `  - 原典: ${sourceUrl(entry)}`,
      "",
    );
  }
}

function appendReimbursement(lines: string[], sorted: WeeklyReportEntry[]): void {
  lines.push("## 4. 療養費・受領委任関連", "");
  const entries = sorted.filter(matchesReimbursement);
  if (entries.length === 0) {
    lines.push("対象期間内に療養費・受領委任関連として抽出した項目はありません。", "");
    return;
  }

  for (const entry of entries) {
    appendEntrySummary(lines, entry);
    lines.push("");
  }
}

function appendCheckpoints(
  lines: string[],
  sorted: WeeklyReportEntry[],
  checkpointsHeading: string,
): void {
  lines.push(`## 5. ${checkpointsHeading}`, "");

  if (sorted.length === 0) {
    lines.push("対象期間内の確認ポイントはありません。", "");
    return;
  }

  const checkpoints = new Map<string, WeeklyReportEntry[]>();
  for (const entry of sorted) {
    for (const checkpoint of entry.analysis.operator_checkpoints) {
      const normalized = checkpoint.trim();
      if (!normalized) continue;
      checkpoints.set(normalized, [...(checkpoints.get(normalized) ?? []), entry]);
    }
  }

  if (checkpoints.size === 0) {
    lines.push("対象期間内の確認ポイントはありません。", "");
    return;
  }

  for (const [checkpoint, entries] of checkpoints.entries()) {
    const refs = entries
      .map((entry) => `${entryTitle(entry)} / ${entry.analysis.changeId}`)
      .join("、");
    lines.push(`- ${checkpoint}`, `  - 関連: ${refs}`);
  }
  lines.push("");
}

function appendExpertCandidates(lines: string[], sorted: WeeklyReportEntry[]): void {
  lines.push("## 6. 専門家確認候補", "");
  const entries = sorted.filter((entry) => entry.analysis.needsExpertReview);
  if (entries.length === 0) {
    lines.push("専門家確認候補として抽出した項目はありません。", "");
    return;
  }

  for (const entry of entries) {
    lines.push(
      `- [${entry.analysis.importance}] ${entryTitle(entry)}`,
      `  - 原典: ${sourceUrl(entry)}`,
      `  - 不明点: ${
        entry.analysis.unknowns.length > 0
          ? entry.analysis.unknowns.join(" / ")
          : "不明点の列挙なし"
      }`,
      "",
    );
  }
}

function appendSources(lines: string[], sorted: WeeklyReportEntry[]): void {
  lines.push("## 7. 原典一覧", "");

  if (sorted.length === 0) {
    lines.push("対象期間内の原典はありません。", "");
    return;
  }

  for (const entry of sorted) {
    lines.push(
      `- ${entry.change.sourceName}: ${entryTitle(entry)}`,
      `  - changeId: ${entry.analysis.changeId}`,
      `  - detectedAt: ${entry.detectedDate}`,
      `  - URL: ${sourceUrl(entry)}`,
      "",
    );
  }
}

function appendFooter(lines: string[]): void {
  lines.push(
    "---",
    "",
    "※ 本レポートは自動生成です。法的判断の断定ではありません。原典を必ずご確認ください。",
    "",
  );
}

export function generateWeeklyReportMarkdown(input: WeeklyReportInput): string {
  const sorted = sortEntries(input.entries);
  const lines: string[] = [];

  appendHeader(lines, input);
  appendImportantUpdates(lines, sorted);
  appendBusinessImpacts(lines, sorted);
  appendAdImpacts(lines, sorted);
  appendReimbursement(lines, sorted);
  appendCheckpoints(lines, sorted, input.checkpointsHeading);
  appendExpertCandidates(lines, sorted);
  appendSources(lines, sorted);
  appendFooter(lines);

  return lines.join("\n");
}
