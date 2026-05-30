import { describe, expect, it } from "vitest";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";
import { generateManualImpactMarkdown } from "./manualImpactReport.js";

function change(overrides: Partial<DetectedChange> = {}): DetectedChange {
  return {
    id: "c1",
    sourceId: "s",
    sourceName: "厚生労働省",
    sourceWeight: "high",
    targetKey: "k",
    url: "https://example.com/source",
    title: "療養費請求手続きの更新",
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
    category: "療養費請求",
    targetBusiness: ["整骨院"],
    summary: "療養費請求フローに関する更新です。",
    whatChanged: "変更",
    impact: "受付説明と請求フローの確認が必要です。",
    adImpact: "該当なし",
    operator_checkpoints: [
      "受付説明を確認する",
      "受付説明を確認する",
      "療養費請求フローを確認する",
    ],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: true,
    confidence: 0.8,
    unknowns: ["適用開始日"],
    sourceUrl: "https://example.com/source",
    analyzedAt: "2026-05-28T01:00:00Z",
    ...overrides,
  };
}

describe("generateManualImpactMarkdown", () => {
  it("renders an empty manual impact report with explicit no-target wording", () => {
    const md = generateManualImpactMarkdown({
      date: "2026-05-28",
      entries: [],
    });

    expect(md).toContain("type: legal-watch-manual-impact");
    expect(md).toContain("date: 2026-05-28");
    expect(md).toContain("target_count: 0");
    expect(md).toContain(
      "対象日に院内マニュアル影響確認へ紐づく Analysis はありません。",
    );
    expect(md).toContain("対象日に院内マニュアル影響確認へ紐づく原典はありません。");
  });

  it("renders update-derived checkpoints, fixed viewpoints, and sources", () => {
    const md = generateManualImpactMarkdown({
      date: "2026-05-28",
      entries: [
        {
          analysis: analysis(),
          change: change(),
          detectedDate: "2026-05-28 09:00",
          selectionReasons: ["impact", "operator_checkpoints"],
          manualReviewAreas: ["受付対応", "療養費請求フロー"],
        },
      ],
    });

    expect(md).toContain("target_count: 1");
    expect(md).toContain("### [high] 療養費請求手続きの更新");
    expect(md).toContain("- 原典: https://example.com/source");
    expect(md).toContain("- changeId: c1");
    expect(md).toContain("- 抽出理由: impact、operator_checkpoints");
    expect(md).toContain("- 確認対象分類: 受付対応、療養費請求フロー");
    expect(md).toContain("**実務影響（要確認）**");
    expect(md).toContain("受付説明と請求フローの確認が必要です。");
    expect(md).toContain("**更新由来の確認項目**");
    expect(md).toContain("- [ ] 受付説明を確認する");
    expect(md.match(/- \[ \] 受付説明を確認する/g)).toHaveLength(1);
    expect(md).toContain("**固定確認観点**");
    expect(md).toContain("- [ ] 問診票・同意書・リスク説明への反映要否を確認する");
    expect(md).toContain("- [ ] 療養費・受領委任・請求フローへの反映要否を確認する");
    expect(md).toContain("**不明点**");
    expect(md).toContain("- 適用開始日");
    expect(md).toContain("## 2. 原典一覧");
    expect(md).toContain("法的判断の断定ではありません");
    expect(md).not.toContain("問題なし");
  });
});
