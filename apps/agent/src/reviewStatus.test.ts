import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import { describe, expect, it } from "vitest";
import {
  importLatestAnalysesToReviewDb,
  listReviewItems,
  setReviewItemStatus,
} from "./reviewStatus.js";

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    changeId: "current-change",
    relevance: "high",
    importance: "medium",
    category: "療養費",
    targetBusiness: ["整骨院"],
    summary: "古い要約",
    whatChanged: "変更",
    impact: "影響",
    adImpact: "広告",
    operator_checkpoints: ["確認1"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.8,
    unknowns: [],
    sourceUrl: "https://example.com/current",
    analyzedAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

function rawSnapshot(overrides: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    changeId: "current-change",
    sourceId: "test-source",
    sourceName: "Test source",
    sourceWeight: "medium",
    targetKey: "https://example.com/current",
    url: "https://example.com/current",
    title: "Current update",
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
  const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-review-"));
  await mkdir(path.join(root, "data", "raw"), { recursive: true });
  return root;
}

describe("review status import", () => {
  it("imports latest ok Analysis with matching raw snapshots into SQLite", async () => {
    const root = await tempRoot();
    await writeRaw(root, rawSnapshot());
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "expert-change",
        title: "Expert update",
        url: "https://example.com/expert",
      }),
    );
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "outside-change",
        title: "Outside update",
        url: "https://example.com/outside",
        detectedAt: "2026-05-28T15:00:00.000Z",
      }),
    );

    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      [
        JSON.stringify({
          at: "2026-05-28T00:00:00.000Z",
          changeId: "current-change",
          status: "ok",
          analysis: analysis(),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "current-change",
          status: "ok",
          analysis: analysis({
            summary: "新しい要約",
            analyzedAt: "2026-05-28T01:00:00.000Z",
          }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "expert-change",
          status: "ok",
          analysis: analysis({
            changeId: "expert-change",
            summary: "専門家確認が必要",
            needsExpertReview: true,
            sourceUrl: "https://example.com/expert",
          }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "outside-change",
          status: "ok",
          analysis: analysis({ changeId: "outside-change" }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "missing-raw",
          status: "ok",
          analysis: analysis({ changeId: "missing-raw" }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "ok-without-analysis",
          status: "ok",
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "error-change",
          status: "error",
          error: "bad json",
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await importLatestAnalysesToReviewDb({
      root,
      date: "2026-05-28",
      timezone: "Asia/Tokyo",
    });

    expect(result.imported).toBe(2);
    expect(result.skippedMissingRaw).toBe(1);
    expect(result.skippedOutsideDate).toBe(1);
    const items = await listReviewItems({ root, date: "2026-05-28" });
    expect(items.map((item) => item.changeId).sort()).toEqual([
      "current-change",
      "expert-change",
    ]);
    expect(items.find((item) => item.changeId === "current-change")!.summary).toBe(
      "新しい要約",
    );
    expect(items.find((item) => item.changeId === "expert-change")!.status).toBe(
      "expert_review_required",
    );
  });

  it("updates confirmation status by changeId and analysisId", async () => {
    const root = await tempRoot();
    await writeRaw(root, rawSnapshot());
    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      JSON.stringify({
        at: "2026-05-28T00:00:00.000Z",
        changeId: "current-change",
        status: "ok",
        analysis: analysis(),
      }),
      "utf8",
    );
    await importLatestAnalysesToReviewDb({ root });

    const confirmed = await setReviewItemStatus({
      root,
      changeId: "current-change",
      status: "confirmed",
      note: "院内資料確認済み",
      confirmedBy: "operator",
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedAt).toBeDefined();
    expect(confirmed.note).toBe("院内資料確認済み");

    const unconfirmed = await setReviewItemStatus({
      root,
      analysisId: confirmed.analysisId,
      status: "new",
    });
    expect(unconfirmed.status).toBe("new");
    expect(unconfirmed.confirmedAt).toBeUndefined();
    expect(unconfirmed.note).toBe("院内資料確認済み");
  });

  it("requires the matching data/raw/{changeId}.json file, not only embedded raw.changeId", async () => {
    const root = await tempRoot();
    await writeFile(
      path.join(root, "data", "raw", "other-file.json"),
      JSON.stringify(rawSnapshot({ changeId: "current-change" })),
      "utf8",
    );
    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      JSON.stringify({
        at: "2026-05-28T00:00:00.000Z",
        changeId: "current-change",
        status: "ok",
        analysis: analysis(),
      }),
      "utf8",
    );

    const result = await importLatestAnalysesToReviewDb({ root });

    expect(result.imported).toBe(0);
    expect(result.skippedMissingRaw).toBe(1);
    await expect(listReviewItems({ root })).resolves.toEqual([]);
  });

  it("does not read Markdown or Obsidian checkbox state during import", async () => {
    const root = await tempRoot();
    await mkdir(path.join(root, "reports", "checklists"), { recursive: true });
    await writeFile(
      path.join(root, "reports", "checklists", "2026-05-28_ad_checklist.md"),
      [
        "# 広告・LP・SNSチェックリスト",
        "",
        "- [x] current-change は確認済み",
      ].join("\n"),
      "utf8",
    );
    await writeRaw(root, rawSnapshot());
    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      JSON.stringify({
        at: "2026-05-28T00:00:00.000Z",
        changeId: "current-change",
        status: "ok",
        analysis: analysis(),
      }),
      "utf8",
    );

    await importLatestAnalysesToReviewDb({
      root,
      date: "2026-05-28",
      timezone: "Asia/Tokyo",
    });

    const items = await listReviewItems({ root });
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("new");
  });

  it("rejects malformed and impossible dates", async () => {
    await expect(importLatestAnalysesToReviewDb({ date: "../outside" })).rejects.toThrow(
      "Invalid date",
    );
    await expect(listReviewItems({ date: "2026-02-31" })).rejects.toThrow(
      "Invalid date",
    );
  });
});
