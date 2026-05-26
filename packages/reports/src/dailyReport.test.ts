import { describe, expect, it } from "vitest";
import { generateDailyReportMarkdown } from "./dailyReport.js";

describe("generateDailyReportMarkdown", () => {
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
