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
    | "sourceRuns"
    | "changes"
    | "analyses"
    | "gatedOut"
    | "failures"
    | "analysisFailures"
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

function appendLinkedLines(lines: string[], change: DetectedChange | undefined): void {
  if (!change) return;
  if ((change.linkedExcerpts ?? []).length > 0) {
    lines.push("**リンク先抜粋（要原典確認）**");
    for (const linked of change.linkedExcerpts ?? []) {
      lines.push(
        `- ${linked.title ? `${linked.title}: ` : ""}${linked.url}`,
        `  - ${truncateExcerpt(linked.textExcerpt, PDF_REPORT_EXCERPT_MAX_CHARS)}`,
      );
    }
    lines.push("");
  }
  if ((change.linkedErrors ?? []).length > 0) {
    lines.push("**リンク先取得失敗**");
    for (const linked of change.linkedErrors ?? []) {
      lines.push(`- ${linked.url}: ${linked.error}`);
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

function appendConclusionSection(lines: string[], sorted: Analysis[]): void {
  const byRelevance = (rel: string): number =>
    sorted.filter((a) => a.relevance === rel).length;
  const high = byRelevance("high");
  const medium = byRelevance("medium");
  const low = sorted.length - high - medium;
  const expertCount = sorted.filter((a) => a.needsExpertReview).length;

  lines.push("## 本日の結論", "");
  if (high + medium === 0) {
    lines.push("業態に直接影響する更新はありません。", "");
  }
  lines.push(`- 関連度: high ${high}件 / medium ${medium}件 / low ${low}件`);
  if (expertCount > 0) {
    lines.push(`- 要専門家確認: ${expertCount}件`);
  }
  lines.push("");
}

function appendRunStatusSection(
  lines: string[],
  result: DailyReportInput["result"],
): void {
  const runs = result.sourceRuns ?? [];
  const okRuns = runs.filter((run) => run.status === "ok");
  const emptyRuns = runs.filter((run) => run.status === "empty");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const fetchFailureCount = runs.length > 0 ? failedRuns.length : result.failures.length;
  const manualReasons: string[] = [];

  if (fetchFailureCount > 0) manualReasons.push("取得失敗ソースあり");
  if (result.analysisFailures.length > 0) manualReasons.push("LLM分析失敗あり");
  if (emptyRuns.length > 0) manualReasons.push("更新0件ソースあり");
  if (manualReasons.length === 0) manualReasons.push("通常確認");

  lines.push(
    "## 取得・分析状況",
    "",
    `- ソース取得OK: ${runs.length > 0 ? `${okRuns.length}/${runs.length}` : "不明"}`,
    `- 更新0件: ${emptyRuns.length}`,
    `- 取得失敗: ${fetchFailureCount}`,
    `- LLM分析: ${result.analyses.length}/${result.analyses.length + result.analysisFailures.length} OK`,
    `- 要手動確認: ${manualReasons.join("、")}`,
    "",
  );

  if (emptyRuns.length > 0) {
    lines.push("### 更新0件", "");
    for (const run of emptyRuns) {
      lines.push(`- [${run.sourceName}] ${run.url}`, `  - ${run.note ?? "更新0件"}`, "");
    }
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
      );
      // 関連度 low は要約+原典のみのコンパクト表示。フル表示は medium 以上。
      if (a.relevance === "low") {
        if (a.needsExpertReview) {
          lines.push("> 要専門家確認", "");
        }
        continue;
      }
      lines.push(
        `**実務影響（要確認）**`,
        a.impact,
        "",
        `**広告・LP・SNS（要確認）**`,
        a.adImpact,
        "",
      );
      appendPdfLines(lines, change);
      appendLinkedLines(lines, change);
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
    lines.push(
      "再分析する場合:",
      "",
      "```bash",
      "pnpm retry-analysis -- --date YYYY-MM-DD",
      "```",
      "",
    );
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
      `ルールゲートにより LLM 分析していません（${result.gatedOut.length}件）。`,
      "",
    );
    const bySource = new Map<string, number>();
    for (const g of result.gatedOut) {
      bySource.set(g.sourceName, (bySource.get(g.sourceName) ?? 0) + 1);
    }
    lines.push(
      `- ソース別: ${[...bySource.entries()].map(([name, count]) => `${name} ${count}件`).join("、")}`,
      "",
      "<details>",
      "<summary>明細を表示</summary>",
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
      if ((g.linkedErrors ?? []).length > 0) {
        lines.push(`  - リンク先取得失敗: ${g.linkedErrors?.length ?? 0}件`);
      }
      lines.push("");
    }
    lines.push("</details>", "");
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
    if ((result.sourceRuns ?? []).length > 0) appendRunStatusSection(lines, result);
    lines.push("本日の内容更新はありません。", "");
    return lines.join("\n");
  }

  appendConclusionSection(lines, sorted);
  appendRunStatusSection(lines, result);
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
