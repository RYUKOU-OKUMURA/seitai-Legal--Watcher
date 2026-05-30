import { describe, expect, it } from "vitest";
import {
  generateReviewQueueMarkdown,
  type ReviewQueueReportEntry,
} from "./reviewQueueReport.js";

function entry(overrides: Partial<ReviewQueueReportEntry> = {}): ReviewQueueReportEntry {
  return {
    analysisId: "analysis_1",
    changeId: "change-1",
    status: "new",
    importance: "medium",
    category: "療養費",
    title: "確認対象",
    sourceName: "Test source",
    sourceUrl: "https://example.com/source",
    detectedAt: "2026-05-28T01:00:00.000Z",
    detectedDate: "2026-05-28",
    summary: "更新概要",
    impact: "実務影響",
    adImpact: "広告影響",
    operatorCheckpoints: ["原典を確認する"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    unknowns: [],
    ...overrides,
  };
}

describe("generateReviewQueueMarkdown", () => {
  it("renders an empty review queue with explicit no-target wording", () => {
    const md = generateReviewQueueMarkdown({
      date: "2026-05-28",
      entries: [],
    });

    expect(md).toContain("type: legal-watch-review-queue");
    expect(md).toContain("target_count: 0");
    expect(md).toContain("対象日に確認キューへ表示する項目はありません。");
    expect(md).toContain("Markdown のチェックボックス");
  });

  it("renders status, ids, source URL, checkpoints, and prioritizes action/expert items", () => {
    const md = generateReviewQueueMarkdown({
      date: "2026-05-28",
      entries: [
        entry({
          analysisId: "analysis_new",
          changeId: "change-new",
          status: "new",
          importance: "high",
          title: "未確認 high",
        }),
        entry({
          analysisId: "analysis_expert",
          changeId: "change-expert",
          status: "expert_review_required",
          importance: "low",
          title: "専門家確認",
          needsExpertReview: true,
          unknowns: ["適用範囲"],
        }),
        entry({
          analysisId: "analysis_action",
          changeId: "change-action",
          status: "action_required",
          importance: "medium",
          title: "対応要",
          note: "料金表確認中",
        }),
      ],
    });

    expect(md).toContain("| 対応要 | 1 |");
    expect(md).toContain("| 専門家確認要 | 1 |");
    expect(md).toContain("| 未確認 | 1 |");
    expect(md).toContain("- analysisId: analysis_action");
    expect(md).toContain("- changeId: change-action");
    expect(md).toContain("- status: action_required");
    expect(md).toContain("- 原典: https://example.com/source");
    expect(md).toContain("- [ ] 原典を確認する");
    expect(md).toContain("料金表確認中");
    expect(md).toContain("- 適用範囲");

    expect(md.indexOf("対応要")).toBeLessThan(md.indexOf("専門家確認"));
    expect(md.indexOf("専門家確認")).toBeLessThan(md.indexOf("未確認 high"));
  });
});
