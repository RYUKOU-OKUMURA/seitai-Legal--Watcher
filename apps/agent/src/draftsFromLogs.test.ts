import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Analysis } from "@seitai-legal-watch/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectDraftEntriesFromLogs,
  regeneratePracticalDraftsFromLogs,
} from "./draftsFromLogs.js";

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
    bodyExcerpt: "公式情報の更新",
    links: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    changeId: "current-change",
    relevance: "high",
    importance: "medium",
    category: "療養費請求",
    targetBusiness: ["整骨院"],
    summary: "受付説明と請求フローに影響する更新です。",
    whatChanged: "変更",
    impact: "料金表と受付説明を確認する必要があります。",
    adImpact: "該当なし",
    operator_checkpoints: ["受付説明を確認する", "療養費請求フローを確認する"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: true,
    confidence: 0.8,
    unknowns: ["適用開始日"],
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

describe("collectDraftEntriesFromLogs", () => {
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

  it("collects latest ok analyses detected on the requested JST date", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-drafts-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    await writeRaw(root, rawSnapshot());
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
            summary: "新しい下書き要約",
            analyzedAt: "2026-05-28T01:00:00.000Z",
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

    const result = await collectDraftEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId)).toEqual([
      "current-change",
    ]);
    expect(result.entries[0]!.analysis.summary).toBe("新しい下書き要約");
    expect(result.entries[0]!.detectedDate).toBe("2026-05-28 00:00");
  });

  it("uses JST calendar dates for raw detectedAt filtering", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-drafts-"));
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

    const result = await collectDraftEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId).sort()).toEqual([
      "at-start",
      "before-end",
    ]);
  });

  it("rejects malformed dates before using them as file paths", async () => {
    await expect(collectDraftEntriesFromLogs("../outside")).rejects.toThrow(
      "Invalid date",
    );
  });

  it("rejects invalid calendar dates", async () => {
    await expect(collectDraftEntriesFromLogs("2026-02-31")).rejects.toThrow(
      'Invalid date "2026-02-31". Expected YYYY-MM-DD.',
    );
  });

  it("writes the practical drafts report to reports/drafts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-drafts-"));
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
        analysis: analysis({ summary: "下書き要約" }),
      })}\n`,
      "utf8",
    );

    const reportPath = await regeneratePracticalDraftsFromLogs("2026-05-28");
    const markdown = await readFile(reportPath, "utf8");

    expect(reportPath).toBe(
      path.join(root, "reports", "drafts", "2026-05-28_practical_drafts.md"),
    );
    expect(markdown).toContain("type: legal-watch-practical-drafts");
    expect(markdown).toContain("下書き要約");
    expect(markdown).toContain("確認中");
    expect(markdown).toContain("https://example.com/current");
  });
});
