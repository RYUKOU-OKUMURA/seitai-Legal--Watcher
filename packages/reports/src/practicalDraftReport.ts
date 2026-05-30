import { IMPORTANCE_ORDER } from "@seitai-legal-watch/core";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";

export interface PracticalDraftReportEntry {
  analysis: Analysis;
  change: DetectedChange;
  detectedDate: string;
}

export interface PracticalDraftReportInput {
  date: string;
  entries: PracticalDraftReportEntry[];
}

const RISKY_PHRASE_REPLACEMENTS: [RegExp, string][] = [
  [/法律上問題(?:ありません|ない|なし)/g, "法的な扱いは要確認です"],
  [/法的に問題(?:ありません|ない|なし)/g, "法的な扱いは要確認です"],
  [/問題ありません/g, "要確認です"],
  [/問題ない/g, "要確認"],
  [/問題なし/g, "要確認"],
  [/必ず(?:安全|改善|治る|良くなる|解決)/g, "効果・安全性は要確認"],
  [/安全です/g, "安全性は要確認です"],
  [/保証(?:します|できます|されます|する|できる)/g, "断定しません"],
];

function importanceRank(analysis: Analysis): number {
  return IMPORTANCE_ORDER[analysis.importance] ?? 9;
}

function sortEntries(entries: PracticalDraftReportEntry[]): PracticalDraftReportEntry[] {
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

function safeText(value: string): string {
  let text = value.trim();
  for (const [pattern, replacement] of RISKY_PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function entryTitle(entry: PracticalDraftReportEntry): string {
  return safeText(entry.change.title || entry.analysis.summary || "無題");
}

function sourceUrl(entry: PracticalDraftReportEntry): string {
  return entry.analysis.sourceUrl || entry.change.url;
}

function listValue(values: string[]): string {
  return values.length > 0 ? values.map(safeText).join("、") : "未分類";
}

function appendHeader(lines: string[], input: PracticalDraftReportInput): void {
  lines.push(
    "---",
    "type: legal-watch-practical-drafts",
    `date: ${input.date}`,
    `target_count: ${input.entries.length}`,
    "---",
    "",
    "# 実務コミュニケーション下書き",
    "",
    `対象日: ${input.date}`,
    "",
    "> すべて確認中の下書きです。原典・院内運用・必要に応じた専門家確認の前提で使用してください。",
    "",
  );
}

function expertQuestions(entry: PracticalDraftReportEntry): string[] {
  const analysis = entry.analysis;
  const questions = [
    ...analysis.unknowns.map((unknown) => `不明点「${safeText(unknown)}」の扱い`),
  ];

  if (analysis.needsExpertReview) {
    questions.push("専門家確認が必要な論点の切り分け");
  }
  if (analysis.needsOriginalCheck) {
    questions.push("原典上の適用範囲と適用時期");
  }
  if (analysis.needsLocalGovernmentCheck) {
    questions.push("自治体・地方厚生局側の追加確認要否");
  }

  questions.push("院内資料・受付説明・広告表現へ反映する必要があるか");
  return uniqueNonEmpty(questions);
}

function appendDraftEntry(lines: string[], entry: PracticalDraftReportEntry): void {
  const analysis = entry.analysis;
  const title = entryTitle(entry);
  const url = sourceUrl(entry);
  const checkpoints = uniqueNonEmpty(analysis.operator_checkpoints.map(safeText));
  const questions = expertQuestions(entry);

  lines.push(
    `## [${analysis.importance}] ${title}`,
    "",
    `- 情報源: ${entry.change.sourceName}`,
    `- 原典: ${url}`,
    `- changeId: ${analysis.changeId}`,
    `- detectedAt: ${entry.detectedDate}`,
    `- カテゴリ: ${safeText(analysis.category)}`,
    `- 対象業態: ${listValue(analysis.targetBusiness)}`,
    "",
    "### 元情報メモ",
    "",
    `- 更新概要: ${safeText(analysis.summary)}`,
    `- 実務影響（確認中）: ${safeText(analysis.impact)}`,
    `- 広告・LP・SNS（確認中）: ${safeText(analysis.adImpact)}`,
    "",
    "### 院内共有メモ（下書き）",
    "",
    `本日確認した公式情報の更新について、${safeText(analysis.summary)}。現時点では原典確認中です。院内資料、受付説明、スタッフ共有、広告・SNS 表現への反映要否を確認します。`,
    "",
    "確認すること:",
    ...(checkpoints.length > 0
      ? checkpoints.map((checkpoint) => `- ${checkpoint}`)
      : ["- 原典と実際の院内運用を照合する"]),
    "",
    "### スタッフ向け説明（下書き）",
    "",
    `関連する更新がありました。患者さんや利用者から質問があった場合は、現時点では「原典を確認中です。必要な場合は院内で共有します」と案内してください。個別判断や法的な断定は避け、確認が必要な内容は担当者へ共有してください。`,
    "",
    "### 顧問・専門家への確認メール（下書き）",
    "",
    "件名: 公式情報更新に関する確認のお願い",
    "",
    "本文:",
    "",
    "お世話になっております。",
    "",
    `以下の公式情報更新について、院内資料・受付説明・スタッフ共有・表示内容への反映要否を確認したく、ご相談です。`,
    "",
    `- 原典: ${url}`,
    `- changeId: ${analysis.changeId}`,
    `- 情報源: ${entry.change.sourceName}`,
    `- 概要: ${safeText(analysis.summary)}`,
    `- 想定される実務影響: ${safeText(analysis.impact)}`,
    "",
    "確認したい論点:",
    ...questions.map((question) => `- ${question}`),
    "",
    "現時点では原典確認中であり、当院としての判断は未確定です。確認すべき観点や修正が必要な資料があればご教示ください。",
    "",
    "### SNS・ブログ向け控えめ文案（下書き）",
    "",
    "公式情報に更新があり、当院内の説明資料やご案内への影響がないか確認しています。内容が確定した場合は、必要に応じて院内でのご案内を更新します。",
    "",
  );
}

function appendBody(lines: string[], sorted: PracticalDraftReportEntry[]): void {
  lines.push("## 1. 下書き対象", "");

  if (sorted.length === 0) {
    lines.push(
      "対象日に実務コミュニケーション下書きへ紐づく Analysis はありません。",
      "",
      "## 2. 下書き",
      "",
      "対象更新がないため、転用下書きはありません。",
      "",
      "## 3. 原典一覧",
      "",
      "対象日に転用下書きへ紐づく原典はありません。",
      "",
    );
    return;
  }

  for (const entry of sorted) {
    lines.push(
      `- [${entry.analysis.importance}] ${entryTitle(entry)}`,
      `  - changeId: ${entry.analysis.changeId}`,
      `  - 原典: ${sourceUrl(entry)}`,
    );
  }
  lines.push("", "## 2. 下書き", "");

  for (const entry of sorted) {
    appendDraftEntry(lines, entry);
  }

  lines.push("## 3. 原典一覧", "");
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
    "※ 本ファイルは自動生成された下書きです。法的判断の断定ではありません。公開・配布・送信前に原典、院内資料、必要に応じた専門家確認を行ってください。",
    "",
  );
}

export function generatePracticalDraftMarkdown(input: PracticalDraftReportInput): string {
  const sorted = sortEntries(input.entries);
  const lines: string[] = [];

  appendHeader(lines, input);
  appendBody(lines, sorted);
  appendFooter(lines);

  return lines.join("\n");
}
