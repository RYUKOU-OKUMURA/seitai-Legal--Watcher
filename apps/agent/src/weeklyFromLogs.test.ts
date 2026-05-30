import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectWeeklyEntriesFromLogs,
  isoWeekPeriod,
  regenerateWeeklyReportFromLogs,
} from "./weeklyFromLogs.js";

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
    detectedAt: "2026-05-25T15:00:00.000Z",
    changeType: "updated",
    bodyExcerpt: "療養費の更新",
    links: [],
    ...overrides,
  };
}

function analysis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    analyzedAt: "2026-05-26T00:00:00.000Z",
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

describe("isoWeekPeriod", () => {
  it("converts an ISO week into a Monday-Sunday date range", () => {
    expect(isoWeekPeriod("2026-W22")).toEqual({
      week: "2026-W22",
      startDate: "2026-05-25",
      endDate: "2026-05-31",
    });
  });

  it("handles year-crossing ISO weeks", () => {
    expect(isoWeekPeriod("2026-W01")).toEqual({
      week: "2026-W01",
      startDate: "2025-12-29",
      endDate: "2026-01-04",
    });
  });

  it("rejects invalid ISO week strings", () => {
    expect(() => isoWeekPeriod("2026-W54")).toThrow("Invalid ISO week");
    expect(() => isoWeekPeriod("2026-22")).toThrow("Expected format");
  });
});

describe("collectWeeklyEntriesFromLogs", () => {
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

  it("collects latest ok analyses with raw snapshots detected in the requested JST week", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-weekly-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });
    await mkdir(path.join(root, "reports", "weekly"), { recursive: true });

    await writeRaw(root, rawSnapshot());
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "fallback-change",
        title: "Fallback update",
        url: "https://example.com/fallback",
      }),
    );
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "outside-change",
        title: "Outside update",
        detectedAt: "2026-06-01T00:00:00.000Z",
        url: "https://example.com/outside",
      }),
    );

    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      [
        JSON.stringify({
          at: "2026-05-26T00:00:00.000Z",
          changeId: "current-change",
          status: "ok",
          analysis: analysis(),
        }),
        JSON.stringify({
          at: "2026-05-26T01:00:00.000Z",
          changeId: "current-change",
          status: "ok",
          analysis: analysis({
            summary: "新しい要約",
            analyzedAt: "2026-05-26T01:00:00.000Z",
          }),
        }),
        JSON.stringify({
          at: "2026-05-26T01:00:00.000Z",
          changeId: "fallback-change",
          status: "ok",
          analysis: analysis({
            changeId: "fallback-change",
            summary: "古い fallback",
            analyzedAt: undefined,
          }),
        }),
        JSON.stringify({
          at: "2026-05-26T02:00:00.000Z",
          changeId: "fallback-change",
          status: "ok",
          analysis: analysis({
            changeId: "fallback-change",
            summary: "新しい fallback",
            analyzedAt: undefined,
          }),
        }),
        JSON.stringify({
          at: "2026-05-26T01:00:00.000Z",
          changeId: "missing-raw",
          status: "ok",
          analysis: analysis({ changeId: "missing-raw" }),
        }),
        JSON.stringify({
          at: "2026-05-26T01:00:00.000Z",
          changeId: "ok-without-analysis",
          status: "ok",
        }),
        JSON.stringify({
          at: "2026-05-26T01:00:00.000Z",
          changeId: "outside-change",
          status: "ok",
          analysis: analysis({ changeId: "outside-change" }),
        }),
        JSON.stringify({
          at: "2026-05-26T01:00:00.000Z",
          changeId: "error-change",
          status: "error",
          error: "bad json",
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await collectWeeklyEntriesFromLogs("2026-W22", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries).toHaveLength(2);
    const current = result.entries.find((entry) => entry.analysis.changeId === "current-change");
    const fallback = result.entries.find((entry) => entry.analysis.changeId === "fallback-change");
    expect(current).toBeDefined();
    expect(fallback).toBeDefined();
    expect(current!.analysis.summary).toBe("新しい要約");
    expect(current!.detectedDate).toBe("2026-05-26 00:00");
    expect(fallback!.analysis.summary).toBe("新しい fallback");
  });

  it("uses JST week boundaries for raw detectedAt filtering", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-weekly-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    const raws = [
      { id: "before-start", detectedAt: "2026-05-24T14:59:59.999Z" },
      { id: "at-start", detectedAt: "2026-05-24T15:00:00.000Z" },
      { id: "before-end", detectedAt: "2026-05-31T14:59:59.999Z" },
      { id: "at-end", detectedAt: "2026-05-31T15:00:00.000Z" },
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
            at: "2026-05-26T00:00:00.000Z",
            changeId: raw.id,
            status: "ok",
            analysis: analysis({
              changeId: raw.id,
              summary: raw.id,
              sourceUrl: `https://example.com/${raw.id}`,
            }),
          }),
        )
        .join("\n"),
      "utf8",
    );

    const result = await collectWeeklyEntriesFromLogs("2026-W22", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId).sort()).toEqual([
      "at-start",
      "before-end",
    ]);
  });

  it("fails on malformed llm-log JSONL instead of treating the week as empty", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-weekly-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });
    await writeRaw(root, rawSnapshot());
    await writeFile(path.join(root, "data", "llm-log.jsonl"), "{bad json}\n", "utf8");

    await expect(
      collectWeeklyEntriesFromLogs("2026-W22", {
        root,
        timezone: "Asia/Tokyo",
      }),
    ).rejects.toThrow("Invalid JSONL");
  });

  it("writes the weekly report to reports/weekly", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-weekly-"));
    process.env.LEGAL_WATCH_ROOT = root;
    process.env.LEGAL_WATCH_TIMEZONE = "Asia/Tokyo";
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    await writeRaw(root, rawSnapshot());
    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      `${JSON.stringify({
        at: "2026-05-26T00:00:00.000Z",
        changeId: "current-change",
        status: "ok",
        analysis: analysis({ summary: "週次要約" }),
      })}\n`,
      "utf8",
    );

    const reportPath = await regenerateWeeklyReportFromLogs("2026-W22");
    const markdown = await readFile(reportPath, "utf8");

    expect(reportPath).toBe(path.join(root, "reports", "weekly", "2026-W22_legal_watch.md"));
    expect(markdown).toContain("type: legal-watch-weekly");
    expect(markdown).toContain("週次要約");
  });
});
