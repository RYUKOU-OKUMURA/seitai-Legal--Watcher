import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import { describe, expect, it } from "vitest";
import { importLatestAnalysesToReviewDb, setReviewItemStatus } from "./reviewStatus.js";
import {
  collectReviewQueueEntries,
  formatReviewQueueResult,
  regenerateReviewQueueFromDb,
} from "./reviewQueue.js";

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    changeId: "change-new",
    relevance: "high",
    importance: "medium",
    category: "療養費",
    targetBusiness: ["整骨院"],
    summary: "確認対象",
    whatChanged: "変更",
    impact: "実務影響",
    adImpact: "広告影響",
    operator_checkpoints: ["原典を確認する"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.8,
    unknowns: [],
    sourceUrl: "https://example.com/change-new",
    analyzedAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

function rawSnapshot(overrides: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    changeId: "change-new",
    sourceId: "test-source",
    sourceName: "Test source",
    sourceWeight: "medium",
    targetKey: "https://example.com/change-new",
    url: "https://example.com/change-new",
    title: "確認対象",
    detectedAt: "2026-05-27T15:00:00.000Z",
    changeType: "updated",
    bodyExcerpt: "療養費の更新",
    links: [],
    ...overrides,
  };
}

async function writeRaw(root: string, payload: RawSnapshot): Promise<void> {
  await writeFile(
    path.join(root, "data", "raw", `${payload.changeId}.json`),
    JSON.stringify(payload),
    "utf8",
  );
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-review-queue-"));
  await mkdir(path.join(root, "data", "raw"), { recursive: true });
  return root;
}

async function seedReviewItems(root: string): Promise<void> {
  const changeIds = [
    "change-new",
    "change-expert",
    "change-action",
    "change-reviewing",
    "change-confirmed",
    "change-ignored",
    "change-archived",
    "change-outside",
  ];

  for (const changeId of changeIds) {
    await writeRaw(
      root,
      rawSnapshot({
        changeId,
        title: changeId,
        url: `https://example.com/${changeId}`,
        detectedAt:
          changeId === "change-outside"
            ? "2026-05-28T15:00:00.000Z"
            : "2026-05-27T15:00:00.000Z",
      }),
    );
  }

  await writeFile(
    path.join(root, "data", "llm-log.jsonl"),
    changeIds
      .map((changeId, index) =>
        JSON.stringify({
          at: `2026-05-28T0${index}:00:00.000Z`,
          changeId,
          status: "ok",
          analysis: analysis({
            changeId,
            sourceUrl: `https://example.com/${changeId}`,
            summary: `${changeId} summary`,
            importance: changeId === "change-new" ? "high" : "medium",
            needsExpertReview: changeId === "change-expert",
            analyzedAt: `2026-05-28T0${index}:00:00.000Z`,
          }),
        }),
      )
      .join("\n"),
    "utf8",
  );

  await importLatestAnalysesToReviewDb({
    root,
    date: "2026-05-28",
    timezone: "Asia/Tokyo",
  });

  await setReviewItemStatus({
    root,
    changeId: "change-action",
    status: "action_required",
    note: "料金表確認中",
  });
  await setReviewItemStatus({
    root,
    changeId: "change-reviewing",
    status: "reviewing",
  });
  await setReviewItemStatus({
    root,
    changeId: "change-confirmed",
    status: "confirmed",
  });
  await setReviewItemStatus({
    root,
    changeId: "change-ignored",
    status: "ignored",
  });
  await setReviewItemStatus({
    root,
    changeId: "change-archived",
    status: "archived",
  });
}

describe("collectReviewQueueEntries", () => {
  it("collects today's unconfirmed, reviewing, action, and expert items from watch.db", async () => {
    const root = await tempRoot();
    await mkdir(path.join(root, "reports", "checklists"), { recursive: true });
    await writeFile(
      path.join(root, "reports", "checklists", "2026-05-28_ad_checklist.md"),
      "- [x] change-new checked in Markdown\n",
      "utf8",
    );
    await seedReviewItems(root);

    const result = await collectReviewQueueEntries({
      root,
      date: "2026-05-28",
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.changeId)).toEqual([
      "change-action",
      "change-expert",
      "change-reviewing",
      "change-new",
    ]);
    expect(result.entries.find((entry) => entry.changeId === "change-new")!.status).toBe(
      "new",
    );
    expect(result.entries.map((entry) => entry.changeId)).not.toContain("change-confirmed");
    expect(result.entries.map((entry) => entry.changeId)).not.toContain("change-ignored");
    expect(result.entries.map((entry) => entry.changeId)).not.toContain("change-archived");
    expect(result.entries.map((entry) => entry.changeId)).not.toContain("change-outside");
  });

  it("writes a review queue Markdown report under reports/review", async () => {
    const root = await tempRoot();
    await seedReviewItems(root);

    const reportPath = await regenerateReviewQueueFromDb("2026-05-28", { root });
    const markdown = await readFile(reportPath, "utf8");

    expect(reportPath).toBe(
      path.join(root, "reports", "review", "2026-05-28_review_queue.md"),
    );
    expect(markdown).toContain("type: legal-watch-review-queue");
    expect(markdown).toContain("analysisId:");
    expect(markdown).toContain("change-action");
    expect(markdown).toContain("status: action_required");
    expect(markdown).toContain("https://example.com/change-action");
    expect(markdown).toContain("料金表確認中");
    expect(markdown).not.toContain("change-confirmed summary");
  });

  it("formats review queue entries for CLI output", async () => {
    const root = await tempRoot();
    await seedReviewItems(root);
    const result = await collectReviewQueueEntries({
      root,
      date: "2026-05-28",
      timezone: "Asia/Tokyo",
    });

    const output = formatReviewQueueResult(result);

    expect(output).toContain("Review queue for 2026-05-28");
    expect(output).toContain("action_required\t1");
    expect(output).toContain("expert_review_required\t1");
    expect(output).toContain("new\t1");
    expect(output).toContain("change-action\taction_required");
    expect(output).toContain("change-expert\texpert_review_required");
    expect(output).not.toContain("change-confirmed");
  });

  it("writes an empty queue for a day without review targets", async () => {
    const root = await tempRoot();

    const reportPath = await regenerateReviewQueueFromDb("2026-05-28", { root });
    const markdown = await readFile(reportPath, "utf8");

    expect(markdown).toContain("target_count: 0");
    expect(markdown).toContain("対象日に確認キューへ表示する項目はありません。");
  });

  it("rejects malformed dates before writing report paths", async () => {
    const root = await tempRoot();

    await expect(regenerateReviewQueueFromDb("../outside", { root })).rejects.toThrow(
      "Invalid date",
    );
    await expect(regenerateReviewQueueFromDb("2026-02-31", { root })).rejects.toThrow(
      "Invalid date",
    );
  });
});
