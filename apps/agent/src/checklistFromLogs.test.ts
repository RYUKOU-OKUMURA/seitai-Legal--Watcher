import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Analysis } from "@seitai-legal-watch/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectChecklistEntriesFromLogs,
  isAdChecklistTarget,
  regenerateAdChecklistFromLogs,
} from "./checklistFromLogs.js";

const previousRoot = process.env.LEGAL_WATCH_ROOT;
const previousTimezone = process.env.LEGAL_WATCH_TIMEZONE;

function rawSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    bodyExcerpt: "広告表示の更新",
    links: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    changeId: "current-change",
    relevance: "high",
    importance: "medium",
    category: "広告表示",
    targetBusiness: ["整体院"],
    summary: "古い要約",
    whatChanged: "変更",
    impact: "影響",
    adImpact: "LP の表示内容を確認する必要があります。",
    operator_checkpoints: ["LP 表現を確認する"],
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

async function writeRaw(root: string, payload: Record<string, unknown>): Promise<void> {
  await writeFile(
    path.join(root, "data", "raw", `${String(payload.changeId)}.json`),
    JSON.stringify(payload),
    "utf8",
  );
}

describe("collectChecklistEntriesFromLogs", () => {
  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.LEGAL_WATCH_ROOT;
    } else {
      process.env.LEGAL_WATCH_ROOT = previousRoot;
    }
    if (previousTimezone === undefined) {
      delete process.env.LEGAL_WATCH_TIMEZONE;
    } else {
      process.env.LEGAL_WATCH_TIMEZONE = previousTimezone;
    }
  });

  it("collects latest ok analyses detected on the requested JST date and filters ad targets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-checklist-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    await writeRaw(root, rawSnapshot());
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "checkpoint-target",
        title: "Checkpoint target",
        url: "https://example.com/checkpoint",
      }),
    );
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "low-only",
        title: "Low only",
        url: "https://example.com/low",
      }),
    );
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "outside-date",
        title: "Outside date",
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
          changeId: "checkpoint-target",
          status: "ok",
          analysis: analysis({
            changeId: "checkpoint-target",
            category: "療養費",
            adImpact: "該当なし",
            operator_checkpoints: ["SNS 投稿表現を確認する"],
            sourceUrl: "https://example.com/checkpoint",
          }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "low-only",
          status: "ok",
          analysis: analysis({
            changeId: "low-only",
            category: "療養費",
            summary: "請求手続き",
            impact: "実務確認",
            adImpact: "該当なし",
            operator_checkpoints: ["原典を確認する"],
            sourceUrl: "https://example.com/low",
          }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "outside-date",
          status: "ok",
          analysis: analysis({ changeId: "outside-date" }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "missing-raw",
          status: "ok",
          analysis: analysis({ changeId: "missing-raw" }),
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

    const result = await collectChecklistEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId).sort()).toEqual([
      "checkpoint-target",
      "current-change",
    ]);
    const current = result.entries.find((entry) => entry.analysis.changeId === "current-change");
    const checkpoint = result.entries.find(
      (entry) => entry.analysis.changeId === "checkpoint-target",
    );
    expect(current!.analysis.summary).toBe("新しい要約");
    expect(current!.detectedDate).toBe("2026-05-28 00:00");
    expect(current!.selectionReasons).toEqual([
      "adImpact",
      "category",
      "確認ポイント・要約",
    ]);
    expect(checkpoint!.selectionReasons).toEqual(["確認ポイント・要約"]);
  });

  it("uses JST calendar dates for raw detectedAt filtering", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-checklist-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    const raws = [
      { id: "before-start", detectedAt: "2026-05-27T14:59:59.999Z" },
      { id: "at-start", detectedAt: "2026-05-27T15:00:00.000Z" },
      { id: "before-end", detectedAt: "2026-05-28T14:59:59.999Z" },
      { id: "at-end", detectedAt: "2026-05-28T15:00:00.000Z" },
    ];

    for (const raw of raws) {
      await writeRaw(
        root,
        rawSnapshot({
          changeId: raw.id,
          title: raw.id,
          url: `https://example.com/${raw.id}`,
          detectedAt: raw.detectedAt,
        }),
      );
    }

    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      raws
        .map((raw) =>
          JSON.stringify({
            at: "2026-05-28T00:00:00.000Z",
            changeId: raw.id,
            status: "ok",
            analysis: analysis({
              changeId: raw.id,
              sourceUrl: `https://example.com/${raw.id}`,
            }),
          }),
        )
        .join("\n"),
      "utf8",
    );

    const result = await collectChecklistEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId).sort()).toEqual([
      "at-start",
      "before-end",
    ]);
  });

  it("rejects malformed dates before using them as file paths", async () => {
    await expect(collectChecklistEntriesFromLogs("../outside")).rejects.toThrow(
      "Invalid date",
    );
  });

  it("classifies low adImpact text as non-target unless another ad signal exists", () => {
    expect(
      isAdChecklistTarget(
        analysis({
          category: "療養費",
          summary: "請求手続き",
          impact: "実務確認",
          adImpact: "該当なし",
          operator_checkpoints: ["原典を確認する"],
        }),
      ),
    ).toBe(false);
  });

  it("keeps mixed low-impact wording when adImpact also contains an actionable ad review cue", () => {
    expect(
      isAdChecklistTarget(
        analysis({
          category: "療養費",
          summary: "請求手続き",
          impact: "実務確認",
          adImpact: "直接改正ではない。ただし Web/SNS の契約条件表示は要確認。",
          operator_checkpoints: ["原典を確認する"],
        }),
      ),
    ).toBe(true);
  });

  it("does not select generic body text that only uses display wording outside an ad context", () => {
    expect(
      isAdChecklistTarget(
        analysis({
          category: "手続き",
          summary: "管理画面の表示項目が更新されました。",
          impact: "内部確認が必要です。",
          adImpact: "該当なし",
          operator_checkpoints: ["表示項目を確認する"],
        }),
      ),
    ).toBe(false);
  });

  it("writes the checklist report to reports/checklists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-checklist-"));
    process.env.LEGAL_WATCH_ROOT = root;
    process.env.LEGAL_WATCH_TIMEZONE = "Asia/Tokyo";
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    await writeRaw(root, rawSnapshot());
    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      `${JSON.stringify({
        at: "2026-05-28T00:00:00.000Z",
        changeId: "current-change",
        status: "ok",
        analysis: analysis({ summary: "チェックリスト要約" }),
      })}\n`,
      "utf8",
    );

    const reportPath = await regenerateAdChecklistFromLogs("2026-05-28");
    const markdown = await readFile(reportPath, "utf8");

    expect(reportPath).toBe(
      path.join(root, "reports", "checklists", "2026-05-28_ad_checklist.md"),
    );
    expect(markdown).toContain("type: legal-watch-ad-checklist");
    expect(markdown).toContain("チェックリスト要約");
  });
});
