import { describe, expect, it } from "vitest";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";
import { generateDailyReportMarkdown } from "./dailyReport.js";

function change(overrides: Partial<DetectedChange> = {}): DetectedChange {
  return {
    id: "c1",
    sourceId: "s",
    sourceName: "S",
    sourceWeight: "high",
    targetKey: "k",
    url: "https://example.com/a",
    title: "更新タイトル",
    detectedAt: "2026-05-26T00:00:00Z",
    changeType: "updated",
    bodyExcerpt: "本文抜粋",
    links: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    changeId: "c1",
    relevance: "high",
    importance: "high",
    category: "療養費",
    targetBusiness: ["整骨院"],
    summary: "要約",
    whatChanged: "変更",
    impact: "影響",
    adImpact: "広告",
    operator_checkpoints: ["確認1"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.8,
    unknowns: [],
    sourceUrl: "https://example.com/a",
    analyzedAt: "2026-05-26T01:00:00Z",
    ...overrides,
  };
}

describe("generateDailyReportMarkdown", () => {
  it("matches the bootstrap report contract exactly", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      bootstrap: true,
      result: {
        changes: [
          change({
            id: "baseline-change",
            sourceName: "厚労省",
            url: "https://www.mhlw.go.jp/houdou/index.html",
            title: "報道発表",
            changeType: "new",
            pdfExcerpts: [
              {
                url: "https://www.mhlw.go.jp/a.pdf",
                textExcerpt: "PDF本文抜粋",
                contentHash: "hash",
              },
            ],
            pdfErrors: [
              { url: "https://www.mhlw.go.jp/b.pdf", error: "parse failed" },
            ],
          }),
        ],
        analyses: [],
        gatedOut: [],
        failures: [
          change({
            id: "fetch-failure",
            sourceName: "失敗ソース",
            url: "https://example.com/fail",
            title: "失敗ソース（取得失敗）",
            changeType: "failed",
            bodyExcerpt: "timeout",
            httpStatus: 503,
          }),
        ],
        analysisFailures: [],
      },
    });

    expect(md).toBe(
      [
        "---",
        "type: legal-watch-daily",
        "date: 2026-05-26",
        "bootstrap: true",
        "content_update_count: 1",
        "analyzed_count: 0",
        "gated_out_count: 0",
        "fetch_failure_count: 1",
        "---",
        "",
        "# 整体院・整骨院 Legal Watch Daily（初回ベースライン）",
        "",
        "対象日: 2026-05-26",
        "",
        "本実行はベースライン確立です。LLM 分析は行っていません。",
        "次回以降 `pnpm daily` で差分のみ分析されます。",
        "",
        "## ベースライン登録",
        "",
        "- [new] 厚労省: 報道発表",
        "  - 原典: https://www.mhlw.go.jp/houdou/index.html",
        "",
        "**PDF抜粋（要原典確認）**",
        "- https://www.mhlw.go.jp/a.pdf",
        "  - PDF本文抜粋",
        "",
        "**PDF抽出失敗**",
        "- https://www.mhlw.go.jp/b.pdf: parse failed",
        "",
        "- [取得失敗] 失敗ソース",
        "  - URL: https://example.com/fail",
        "  - HTTP 503: timeout",
        "",
        "---",
        "",
        "※ 本レポートは自動生成です。法的判断の断定ではありません。原典を必ずご確認ください。",
        "",
      ].join("\n"),
    );
  });

  it("matches the daily report contract exactly", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [
          change({
            pdfExcerpts: [
              {
                url: "https://example.com/a.pdf",
                textExcerpt: "PDF本文抜粋",
                contentHash: "hash",
              },
            ],
            pdfErrors: [
              { url: "https://example.com/b.pdf", error: "parse failed" },
            ],
          }),
          change({
            id: "fetch-failure",
            sourceName: "失敗ソース",
            url: "https://example.com/fail",
            title: "失敗ソース（取得失敗）",
            changeType: "failed",
            bodyExcerpt: "timeout",
            httpStatus: 0,
          }),
        ],
        analyses: [
          analysis({
            needsExpertReview: true,
            unknowns: ["不明点1"],
          }),
        ],
        gatedOut: [
          change({
            id: "gated",
            title: "未分析タイトル",
            url: "https://example.com/gated",
            sourceWeight: "low",
            gateReasons: ["low_weight", "no_keyword"],
            pdfExcerpts: [
              {
                url: "https://example.com/gated.pdf",
                textExcerpt: "未分析PDF",
                contentHash: "hash-gated",
              },
            ],
            pdfErrors: [
              { url: "https://example.com/gated-error.pdf", error: "too large" },
            ],
          }),
        ],
        failures: [
          change({
            id: "fetch-failure",
            sourceName: "失敗ソース",
            url: "https://example.com/fail",
            title: "失敗ソース（取得失敗）",
            changeType: "failed",
            bodyExcerpt: "timeout",
            httpStatus: 0,
          }),
        ],
        analysisFailures: [{ changeId: "analysis-fail", error: "bad json" }],
      },
    });

    expect(md).toBe(
      [
        "---",
        "type: legal-watch-daily",
        "date: 2026-05-26",
        "bootstrap: false",
        "content_update_count: 1",
        "analyzed_count: 1",
        "gated_out_count: 1",
        "fetch_failure_count: 1",
        "---",
        "",
        "# 整体院・整骨院 Legal Watch Daily",
        "",
        "対象日: 2026-05-26",
        "",
        "## 本日の結論",
        "",
        "- 関連度: high 1件 / medium 0件 / low 0件",
        "- 要専門家確認: 1件",
        "",
        "## 取得・分析状況",
        "",
        "- ソース取得OK: 不明",
        "- 更新0件: 0",
        "- 取得失敗: 1",
        "- LLM分析: 1/2 OK",
        "- 要手動確認: 取得失敗ソースあり、LLM分析失敗あり",
        "",
        "## 分析済み更新",
        "",
        "### [high] 更新タイトル",
        "",
        "- 情報源: S",
        "- 原典: https://example.com/a",
        "- カテゴリ: 療養費",
        "- 対象業態: 整骨院",
        "- 関連度: high",
        "",
        "**要約**",
        "要約",
        "",
        "**実務影響（要確認）**",
        "影響",
        "",
        "**広告・LP・SNS（要確認）**",
        "広告",
        "",
        "**PDF抜粋（要原典確認）**",
        "- https://example.com/a.pdf",
        "  - PDF本文抜粋",
        "",
        "**PDF抽出失敗**",
        "- https://example.com/b.pdf: parse failed",
        "",
        "**確認ポイント**",
        "- 確認1",
        "",
        "> 要専門家確認",
        "",
        "**不明点**",
        "- 不明点1",
        "",
        "## 分析失敗",
        "",
        "- analysis-fail: bad json",
        "",
        "再分析する場合:",
        "",
        "```bash",
        "pnpm retry-analysis -- --date YYYY-MM-DD",
        "```",
        "",
        "## 取得失敗",
        "",
        "- [失敗ソース] https://example.com/fail",
        "  - timeout",
        "",
        "## 参考・未分析",
        "",
        "ルールゲートにより LLM 分析していません（1件）。",
        "",
        "- ソース別: S 1件",
        "",
        "<details>",
        "<summary>明細を表示</summary>",
        "",
        "- 未分析タイトル",
        "  - 原典: https://example.com/gated",
        "  - 理由: low_weight, no_keyword",
        "  - PDF抜粋あり: 1件",
        "  - PDF抽出失敗: 1件",
        "",
        "</details>",
        "",
        "---",
        "",
        "※ 本レポートは自動生成です。法的判断の断定ではありません。原典を必ずご確認ください。",
        "",
      ].join("\n"),
    );
  });

  it("renders low relevance analyses compactly", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [
          change({
            pdfExcerpts: [
              {
                url: "https://example.com/a.pdf",
                textExcerpt: "PDF本文抜粋",
                contentHash: "hash",
              },
            ],
          }),
        ],
        analyses: [
          analysis({
            relevance: "low",
            importance: "low",
            unknowns: ["不明点1"],
          }),
        ],
        gatedOut: [],
        failures: [],
        analysisFailures: [],
      },
    });

    expect(md).toContain("**要約**");
    expect(md).toContain("- 関連度: low");
    expect(md).not.toContain("実務影響");
    expect(md).not.toContain("広告・LP・SNS");
    expect(md).not.toContain("確認ポイント**");
    expect(md).not.toContain("不明点1");
    expect(md).not.toContain("PDF抜粋");
    expect(md).toContain("業態に直接影響する更新はありません");
    expect(md).toContain("- 関連度: high 0件 / medium 0件 / low 1件");
  });

  it("keeps full detail and excerpts for medium relevance analyses", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [
          change({
            pdfExcerpts: [
              {
                url: "https://example.com/a.pdf",
                textExcerpt: "PDF本文抜粋",
                contentHash: "hash",
              },
            ],
          }),
        ],
        analyses: [analysis({ relevance: "medium", importance: "medium" })],
        gatedOut: [],
        failures: [],
        analysisFailures: [],
      },
    });

    expect(md).toContain("実務影響");
    expect(md).toContain("PDF本文抜粋");
    expect(md).toContain("確認1");
    expect(md).not.toContain("業態に直接影響する更新はありません");
  });

  it("renders empty day message", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-25",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [],
        analyses: [],
        gatedOut: [],
        failures: [],
        analysisFailures: [],
      },
    });
    expect(md).toContain("本日の内容更新はありません");
  });

  it("sorts by importance and includes gated section", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-25",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [
          {
            id: "c1",
            sourceId: "s",
            sourceName: "S",
            sourceWeight: "high",
            targetKey: "k",
            url: "https://example.com/a",
            title: "高",
            detectedAt: "2026-05-25T00:00:00Z",
            changeType: "updated",
            bodyExcerpt: "x",
            links: [],
          },
        ],
        analyses: [
          {
            changeId: "c1",
            relevance: "high",
            importance: "high",
            category: "療養費",
            targetBusiness: ["整骨院"],
            summary: "要約",
            whatChanged: "変更",
            impact: "影響",
            adImpact: "広告",
            operator_checkpoints: ["確認1"],
            needsOriginalCheck: true,
            needsLocalGovernmentCheck: false,
            needsExpertReview: false,
            confidence: 0.8,
            unknowns: [],
            sourceUrl: "https://example.com/a",
            analyzedAt: "2026-05-25T01:00:00Z",
          },
        ],
        gatedOut: [
          {
            id: "g1",
            sourceId: "s2",
            sourceName: "S2",
            sourceWeight: "low",
            targetKey: "k2",
            url: "https://example.com/b",
            title: "未分析",
            detectedAt: "2026-05-25T00:00:00Z",
            changeType: "updated",
            bodyExcerpt: "y",
            links: [],
            gateReasons: ["low_weight,no_keyword"],
          },
        ],
        failures: [],
        analysisFailures: [],
      },
    });
    expect(md.indexOf("[high]")).toBeLessThan(md.indexOf("参考・未分析"));
    expect(md).toContain("確認1");
    expect(md).toContain("low_weight,no_keyword");
  });

  it("renders bootstrap baseline report", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      bootstrap: true,
      result: {
        changes: [
          {
            id: "c1",
            sourceId: "mhlw",
            sourceName: "厚労省",
            sourceWeight: "high",
            targetKey: "k",
            url: "https://www.mhlw.go.jp/houdou/index.html",
            title: "報道発表",
            detectedAt: "2026-05-26T00:00:00Z",
            changeType: "new",
            bodyExcerpt: "x",
            links: [],
            pdfExcerpts: [
              {
                url: "https://www.mhlw.go.jp/a.pdf",
                textExcerpt: "PDF本文抜粋",
                contentHash: "hash",
              },
            ],
            pdfErrors: [{ url: "https://www.mhlw.go.jp/b.pdf", error: "parse failed" }],
          },
        ],
        analyses: [],
        gatedOut: [],
        failures: [],
        analysisFailures: [],
      },
    });
    expect(md).toContain("初回ベースライン");
    expect(md).toContain("LLM 分析は行っていません");
    expect(md).toContain("ベースライン登録");
    expect(md).toContain("PDF本文抜粋");
    expect(md).toContain("parse failed");
    expect(md).not.toContain("## 分析済み更新");
  });

  it("renders PDF excerpts and PDF extraction errors", () => {
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [
          {
            id: "c1",
            sourceId: "s",
            sourceName: "S",
            sourceWeight: "high",
            targetKey: "k",
            url: "https://example.com",
            title: "PDFあり",
            detectedAt: "2026-05-26T00:00:00Z",
            changeType: "updated",
            bodyExcerpt: "x",
            links: [],
            pdfExcerpts: [
              {
                url: "https://example.com/a.pdf",
                textExcerpt: "PDF本文抜粋",
                contentHash: "hash",
              },
            ],
            pdfErrors: [{ url: "https://example.com/b.pdf", error: "parse failed" }],
          },
        ],
        analyses: [
          {
            changeId: "c1",
            relevance: "high",
            importance: "high",
            category: "療養費",
            targetBusiness: ["整骨院"],
            summary: "要約",
            whatChanged: "変更",
            impact: "影響",
            adImpact: "広告",
            operator_checkpoints: ["確認1"],
            needsOriginalCheck: true,
            needsLocalGovernmentCheck: false,
            needsExpertReview: false,
            confidence: 0.8,
            unknowns: [],
            sourceUrl: "https://example.com",
            analyzedAt: "2026-05-26T01:00:00Z",
          },
        ],
        gatedOut: [],
        failures: [],
        analysisFailures: [],
      },
    });

    expect(md).toContain("PDF抜粋");
    expect(md).toContain("PDF本文抜粋");
    expect(md).toContain("PDF抽出失敗");
    expect(md).toContain("parse failed");
  });

  it("shortens PDF excerpts in the rendered report", () => {
    const longExcerpt = `${"あ".repeat(900)}末尾`;
    const md = generateDailyReportMarkdown({
      date: "2026-05-26",
      checkpointsHeading: "確認ポイント",
      result: {
        changes: [
          {
            id: "c1",
            sourceId: "s",
            sourceName: "S",
            sourceWeight: "high",
            targetKey: "k",
            url: "https://example.com",
            title: "PDFあり",
            detectedAt: "2026-05-26T00:00:00Z",
            changeType: "updated",
            bodyExcerpt: "x",
            links: [],
            pdfExcerpts: [
              {
                url: "https://example.com/a.pdf",
                textExcerpt: longExcerpt,
                contentHash: "hash",
              },
            ],
          },
        ],
        analyses: [
          {
            changeId: "c1",
            relevance: "high",
            importance: "high",
            category: "療養費",
            targetBusiness: ["整骨院"],
            summary: "要約",
            whatChanged: "変更",
            impact: "影響",
            adImpact: "広告",
            operator_checkpoints: ["確認1"],
            needsOriginalCheck: true,
            needsLocalGovernmentCheck: false,
            needsExpertReview: false,
            confidence: 0.8,
            unknowns: [],
            sourceUrl: "https://example.com",
            analyzedAt: "2026-05-26T01:00:00Z",
          },
        ],
        gatedOut: [],
        failures: [],
        analysisFailures: [],
      },
    });

    expect(md).toContain(`${"あ".repeat(800)}…`);
    expect(md).not.toContain("末尾");
  });
});
