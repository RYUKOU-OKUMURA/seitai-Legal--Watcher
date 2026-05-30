import { describe, expect, it } from "vitest";
import type { Analysis, DetectedChange } from "@seitai-legal-watch/core";
import { generatePracticalDraftMarkdown } from "./practicalDraftReport.js";

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
    summary: "受付説明と請求フローの確認が必要です。",
    whatChanged: "変更",
    impact: "料金表とスタッフ説明への反映要否を確認します。",
    adImpact: "該当なし",
    operator_checkpoints: ["受付説明を確認する", "請求フローを確認する"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: true,
    needsExpertReview: true,
    confidence: 0.8,
    unknowns: ["適用開始日"],
    sourceUrl: "https://example.com/source",
    analyzedAt: "2026-05-28T01:00:00Z",
    ...overrides,
  };
}

describe("generatePracticalDraftMarkdown", () => {
  it("renders an empty draft report with explicit no-target wording", () => {
    const md = generatePracticalDraftMarkdown({
      date: "2026-05-28",
      entries: [],
    });

    expect(md).toContain("type: legal-watch-practical-drafts");
    expect(md).toContain("date: 2026-05-28");
    expect(md).toContain("target_count: 0");
    expect(md).toContain(
      "対象日に実務コミュニケーション下書きへ紐づく Analysis はありません。",
    );
    expect(md).toContain("対象日に転用下書きへ紐づく原典はありません。");
  });

  it("renders internal, staff, expert, and external draft sections with source details", () => {
    const md = generatePracticalDraftMarkdown({
      date: "2026-05-28",
      entries: [
        {
          analysis: analysis({
            summary: "法律上問題ありません。問題ない。必ず安全です。必ず改善します。",
            impact: "問題なし。法的に問題ない。保証できます。",
            targetBusiness: ["問題ない", "必ず改善"],
          }),
          change: change(),
          detectedDate: "2026-05-28 09:00",
        },
      ],
    });

    expect(md).toContain("target_count: 1");
    expect(md).toContain("- 原典: https://example.com/source");
    expect(md).toContain("- changeId: c1");
    expect(md).toContain("### 院内共有メモ（下書き）");
    expect(md).toContain("### スタッフ向け説明（下書き）");
    expect(md).toContain("### 顧問・専門家への確認メール（下書き）");
    expect(md).toContain("### SNS・ブログ向け控えめ文案（下書き）");
    expect(md).toContain("- 不明点「適用開始日」の扱い");
    expect(md).toContain("- 専門家確認が必要な論点の切り分け");
    expect(md).toContain("- 原典上の適用範囲と適用時期");
    expect(md).toContain("- 自治体・地方厚生局側の追加確認要否");
    expect(md).toContain("確認中");
    expect(md).not.toContain("法律上問題ありません");
    expect(md).not.toContain("問題ない");
    expect(md).not.toContain("問題なし");
    expect(md).not.toContain("必ず安全");
    expect(md).not.toContain("必ず改善");
    expect(md).not.toContain("保証できます");
  });
});
