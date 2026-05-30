import { describe, expect, it } from "vitest";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";
import { generateWeeklyReportMarkdown } from "./weeklyReport.js";

function change(overrides: Partial<DetectedChange> = {}): DetectedChange {
  return {
    id: "c1",
    sourceId: "s",
    sourceName: "S",
    sourceWeight: "high",
    targetKey: "k",
    url: "https://example.com/a",
    title: "更新タイトル",
    detectedAt: "2026-05-28T00:00:00Z",
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
    adImpact: "広告影響",
    operator_checkpoints: ["確認1"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.8,
    unknowns: [],
    sourceUrl: "https://example.com/a",
    analyzedAt: "2026-05-28T01:00:00Z",
    ...overrides,
  };
}

describe("generateWeeklyReportMarkdown", () => {
  it("renders an empty weekly report", () => {
    const md = generateWeeklyReportMarkdown({
      week: "2026-W22",
      periodStart: "2026-05-25",
      periodEnd: "2026-05-31",
      checkpointsHeading: "確認ポイント",
      entries: [],
    });

    expect(md).toContain("type: legal-watch-weekly");
    expect(md).toContain("week: 2026-W22");
    expect(md).toContain("analyzed_count: 0");
    expect(md).toContain("対象期間内に Analysis 済みの更新はありません。");
  });

  it("summarizes important updates, business impact, checkpoints, and sources", () => {
    const md = generateWeeklyReportMarkdown({
      week: "2026-W22",
      periodStart: "2026-05-25",
      periodEnd: "2026-05-31",
      checkpointsHeading: "確認ポイント",
      entries: [
        {
          analysis: analysis({
            needsExpertReview: true,
            unknowns: ["施行日"],
          }),
          change: change(),
          detectedDate: "2026-05-28 09:00",
        },
        {
          analysis: analysis({
            changeId: "c2",
            importance: "medium",
            category: "表示広告",
            targetBusiness: ["整体院"],
            summary: "広告要約",
            impact: "整体院の表示に影響する可能性",
            adImpact: "Web表示の確認が必要",
            operator_checkpoints: ["確認1", "確認2"],
            sourceUrl: "https://example.com/b",
          }),
          change: change({
            id: "c2",
            sourceName: "消費者庁",
            title: "広告更新",
            url: "https://example.com/b",
            detectedAt: "2026-05-27T00:00:00Z",
          }),
          detectedDate: "2026-05-27 09:00",
        },
      ],
    });

    expect(md).toContain("## 1. 今週の重要更新");
    expect(md).toContain("- [high] 更新タイトル");
    expect(md).not.toContain("- [medium] 広告更新\n  - 情報源");
    expect(md).toContain("### 2.1 整骨院・接骨院");
    expect(md).toContain("### 2.2 整体院");
    expect(md).toContain("## 5. 確認ポイント");
    expect(md).toContain("- 確認1");
    expect(md).toContain("更新タイトル / c1、広告更新 / c2");
    expect(md).toContain("## 6. 専門家確認候補");
    expect(md).toContain("不明点: 施行日");
    expect(md).toContain("## 7. 原典一覧");
    expect(md).toContain("changeId: c1");
    expect(md).toContain("URL: https://example.com/a");
  });
});
