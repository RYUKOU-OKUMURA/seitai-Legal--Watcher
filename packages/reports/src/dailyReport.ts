import { IMPORTANCE_ORDER, truncateExcerpt } from "@seitai-legal-watch/core";
import type {
  Analysis,
  DetectedChange,
  DailyRunResult,
} from "@seitai-legal-watch/core";

export interface DailyReportInput {
  date: string;
  checkpointsHeading: string;
  bootstrap?: boolean;
  result: Pick<
    DailyRunResult,
    "changes" | "analyses" | "gatedOut" | "failures" | "analysisFailures"
  >;
}

const PDF_REPORT_EXCERPT_MAX_CHARS = 800;

function toAnalyzeSkipped(
  contentChanges: DetectedChange[],
  sorted: Analysis[],
  result: Pick<DailyReportInput["result"], "gatedOut" | "analysisFailures">,
): boolean {
  return (
    sorted.length === 0 &&
    contentChanges.length > 0 &&
    result.gatedOut.length > 0 &&
    result.analysisFailures.length === 0
  );
}

function sortAnalyses(analyses: Analysis[]): Analysis[] {
  return [...analyses].sort(
    (a, b) =>
      (IMPORTANCE_ORDER[a.importance] ?? 9) - (IMPORTANCE_ORDER[b.importance] ?? 9),
  );
}

function formatFailureLine(f: DetectedChange): string {
  const status =
    f.httpStatus && f.httpStatus > 0 ? `HTTP ${f.httpStatus}: ` : "";
  return `  - ${status}${f.bodyExcerpt}`;
}

function appendPdfLines(lines: string[], change: DetectedChange | undefined): void {
  if (!change) return;
  if ((change.pdfExcerpts ?? []).length > 0) {
    lines.push("**PDF抜粋（要原典確認）**");
    for (const pdf of change.pdfExcerpts ?? []) {
      lines.push(
        `- ${pdf.url}`,
        `  - ${truncateExcerpt(pdf.textExcerpt, PDF_REPORT_EXCERPT_MAX_CHARS)}`,
      );
    }
    lines.push("");
  }
  if ((change.pdfErrors ?? []).length > 0) {
    lines.push("**PDF抽出失敗**");
    for (const pdf of change.pdfErrors ?? []) {
      lines.push(`- ${pdf.url}: ${pdf.error}`);
    }
    lines.push("");
  }
}

function appendReportHeader(
  lines: string[],
  input: DailyReportInput,
  contentChanges: DetectedChange[],
  sorted: Analysis[],
): void {
  const { date, bootstrap, result } = input;
  lines.push(
    "---",
    `type: legal-watch-daily`,
    `date: ${date}`,
    `bootstrap: ${bootstrap === true}`,
    `content_update_count: ${contentChanges.length}`,
    `analyzed_count: ${sorted.length}`,
    `gated_out_count: ${result.gatedOut.length}`,
    `fetch_failure_count: ${result.failures.length}`,
    "---",
    "",
    bootstrap
      ? `# 整体院・整骨院 Legal Watch Daily（初回ベースライン）`
      : `# 整体院・整骨院 Legal Watch Daily`,
    "",
    `対象日: ${date}`,
    "",
  );
}

function appendBootstrapSection(
  lines: string[],
  result: DailyReportInput["result"],
  contentChanges: DetectedChange[],
): void {
  lines.push(
    "本実行はベースライン確立です。LLM 分析は行っていません。",
    "次回以降 `pnpm daily` で差分のみ分析されます。",
    "",
  );
  if (contentChanges.length > 0 || result.failures.length > 0) {
    lines.push("## ベースライン登録", "");
    for (const c of contentChanges) {
      lines.push(
        `- [${c.changeType}] ${c.sourceName}: ${c.title}`,
        `  - 原典: ${c.url}`,
        "",
      );
      appendPdfLines(lines, c);
    }
    for (const f of result.failures) {
      lines.push(
        `- [取得失敗] ${f.sourceName}`,
        `  - URL: ${f.url}`,
        formatFailureLine(f),
        "",
      );
    }
  } else {
    lines.push("登録対象の変更はありませんでした。", "");
  }
}

function appendAnalyzedSection(
  lines: string[],
  input: DailyReportInput,
  contentChanges: DetectedChange[],
  sorted: Analysis[],
): void {
  const { checkpointsHeading, result } = input;
  if (sorted.length > 0) {
    lines.push("## 分析済み更新", "");
    for (const a of sorted) {
      const change = result.changes.find((c) => c.id === a.changeId);
      lines.push(
        `### [${a.importance}] ${change?.title ?? a.summary}`,
        "",
        `- 情報源: ${change?.sourceName ?? ""}`,
        `- 原典: ${a.sourceUrl}`,
        `- カテゴリ: ${a.category}`,
        `- 対象業態: ${a.targetBusiness.join("、")}`,
        `- 関連度: ${a.relevance}`,
        "",
        `**要約**`,
        a.summary,
        "",
        `**実務影響（要確認）**`,
        a.impact,
        "",
        `**広告・LP・SNS（要確認）**`,
        a.adImpact,
        "",
      );
      appendPdfLines(lines, change);
      lines.push(
        `**${checkpointsHeading}**`,
        ...a.operator_checkpoints.map((p) => `- ${p}`),
        "",
      );
      if (a.needsExpertReview) {
        lines.push("> 要専門家確認", "");
      }
      if (a.unknowns.length > 0) {
        lines.push("**不明点**", ...a.unknowns.map((u) => `- ${u}`), "");
      }
    }
  } else if (toAnalyzeSkipped(contentChanges, sorted, result)) {
    lines.push(
      "## 分析済み更新",
      "",
      "（変更はありましたが、ルールゲート通過分の Analysis はありません。参考・未分析を確認してください。）",
      "",
    );
  }
}

function appendAnalysisFailuresSection(
  lines: string[],
  result: DailyReportInput["result"],
): void {
  if (result.analysisFailures.length > 0) {
    lines.push("## 分析失敗", "");
    for (const f of result.analysisFailures) {
      lines.push(`- ${f.changeId}: ${f.error}`, "");
    }
  }
}

function appendFetchFailuresSection(
  lines: string[],
  result: DailyReportInput["result"],
): void {
  if (result.failures.length > 0) {
    lines.push("## 取得失敗", "");
    for (const f of result.failures) {
      lines.push(`- [${f.sourceName}] ${f.url}`, formatFailureLine(f), "");
    }
  }
}

function appendGatedOutSection(
  lines: string[],
  result: DailyReportInput["result"],
): void {
  if (result.gatedOut.length > 0) {
    lines.push("## 参考・未分析", "");
    lines.push(
      "ルールゲートにより LLM 分析していません。キーワード・ソース重みの見直しを検討してください。",
      "",
    );
    for (const g of result.gatedOut) {
      lines.push(
        `- ${g.title}`,
        `  - 原典: ${g.url}`,
        `  - 理由: ${(g.gateReasons ?? []).join(", ")}`,
      );
      if ((g.pdfExcerpts ?? []).length > 0) {
        lines.push(`  - PDF抜粋あり: ${g.pdfExcerpts?.length ?? 0}件`);
      }
      if ((g.pdfErrors ?? []).length > 0) {
        lines.push(`  - PDF抽出失敗: ${g.pdfErrors?.length ?? 0}件`);
      }
      lines.push("");
    }
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

export function generateDailyReportMarkdown(input: DailyReportInput): string {
  const { bootstrap, result } = input;
  const contentChanges = result.changes.filter((c) => c.changeType !== "failed");
  const sorted = sortAnalyses(result.analyses);

  const lines: string[] = [];
  appendReportHeader(lines, input, contentChanges, sorted);

  if (bootstrap) {
    appendBootstrapSection(lines, result, contentChanges);
    appendFooter(lines);
    return lines.join("\n");
  }

  if (sorted.length === 0 && contentChanges.length === 0 && result.failures.length === 0) {
    lines.push("本日の内容更新はありません。", "");
    return lines.join("\n");
  }

  appendAnalyzedSection(lines, input, contentChanges, sorted);
  appendAnalysisFailuresSection(lines, result);
  appendFetchFailuresSection(lines, result);
  appendGatedOutSection(lines, result);
  appendFooter(lines);
  return lines.join("\n");
}

export function partitionChanges(
  changes: DetectedChange[],
  analyses: Analysis[],
  gatedOut: DetectedChange[],
): {
  failures: DetectedChange[];
  contentChanges: DetectedChange[];
} {
  const failures = changes.filter((c) => c.changeType === "failed");
  const contentChanges = changes.filter((c) => c.changeType !== "failed");
  return { failures, contentChanges };
}
