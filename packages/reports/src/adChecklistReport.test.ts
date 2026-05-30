import { describe, expect, it } from "vitest";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";
import { generateAdChecklistMarkdown } from "./adChecklistReport.js";

function change(overrides: Partial<DetectedChange> = {}): DetectedChange {
  return {
    id: "c1",
    sourceId: "s",
    sourceName: "消費者庁",
    sourceWeight: "high",
    targetKey: "k",
    url: "https://example.com/source",
    title: "広告表示の更新",
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
    category: "広告表示",
    targetBusiness: ["整体院"],
    summary: "要約",
    whatChanged: "変更",
    impact: "影響",
    adImpact: "LP の効果表現を確認する必要があります。",
    operator_checkpoints: ["LP の効果表現を確認する", "口コミ表示を確認する"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.8,
    unknowns: ["適用時期"],
    sourceUrl: "https://example.com/source",
    analyzedAt: "2026-05-28T01:00:00Z",
    ...overrides,
  };
}

describe("generateAdChecklistMarkdown", () => {
  it("renders an empty checklist with explicit no-target wording", () => {
    const md = generateAdChecklistMarkdown({
      date: "2026-05-28",
      entries: [],
    });

    expect(md).toContain("type: legal-watch-ad-checklist");
    expect(md).toContain("date: 2026-05-28");
    expect(md).toContain("target_count: 0");
    expect(md).toContain(
      "対象日に広告・LP・SNS表現の確認対象として抽出した Analysis はありません。",
    );
    expect(md).toContain("対象日に広告・LP・SNSチェックリストへ紐づく原典はありません。");
  });

  it("separates update-derived checkpoints from fixed ad review viewpoints", () => {
    const md = generateAdChecklistMarkdown({
      date: "2026-05-28",
      entries: [
        {
          analysis: analysis(),
          change: change(),
          detectedDate: "2026-05-28 09:00",
          selectionReasons: ["adImpact", "category"],
        },
      ],
    });

    expect(md).toContain("target_count: 1");
    expect(md).toContain("### [high] 広告表示の更新");
    expect(md).toContain("- 原典: https://example.com/source");
    expect(md).toContain("- changeId: c1");
    expect(md).toContain("- 抽出理由: adImpact、category");
    expect(md).toContain("**広告・LP・SNSへの影響**");
    expect(md).toContain("LP の効果表現を確認する必要があります。");
    expect(md).toContain("**更新由来の確認項目**");
    expect(md).toContain("- [ ] LP の効果表現を確認する");
    expect(md).toContain("**固定確認観点**");
    expect(md).toContain("- [ ] 「治る」と断定していないか");
    expect(md).toContain("- [ ] No.1 表示の根拠が明確か");
    expect(md).toContain("**不明点**");
    expect(md).toContain("- 適用時期");
    expect(md).toContain("## 2. 原典一覧");
  });
});
