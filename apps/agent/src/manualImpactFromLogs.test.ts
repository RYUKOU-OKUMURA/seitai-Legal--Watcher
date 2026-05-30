import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Analysis } from "@seitai-legal-watch/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectManualImpactEntriesFromLogs,
  isManualImpactTarget,
  regenerateManualImpactFromLogs,
} from "./manualImpactFromLogs.js";

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
    bodyExcerpt: "受付説明の更新",
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

describe("collectManualImpactEntriesFromLogs", () => {
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

  it("collects latest ok analyses detected on the requested JST date and filters manual impact targets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-manual-impact-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    await writeRaw(root, rawSnapshot());
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "consent-target",
        title: "Consent target",
        url: "https://example.com/consent",
      }),
    );
    await writeRaw(
      root,
      rawSnapshot({
        changeId: "ad-only",
        title: "Ad only",
        url: "https://example.com/ad-only",
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
            summary: "新しい受付説明の要約",
            analyzedAt: "2026-05-28T01:00:00.000Z",
          }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "consent-target",
          status: "ok",
          analysis: analysis({
            changeId: "consent-target",
            category: "施術リスク説明",
            summary: "同意書と問診票の文言確認が必要です。",
            impact: "スタッフ説明への反映要否を確認する必要があります。",
            operator_checkpoints: ["同意書の現行文言を確認する"],
            sourceUrl: "https://example.com/consent",
          }),
        }),
        JSON.stringify({
          at: "2026-05-28T01:00:00.000Z",
          changeId: "ad-only",
          status: "ok",
          analysis: analysis({
            changeId: "ad-only",
            category: "広告表示",
            summary: "LP と SNS の広告表示を確認する更新です。",
            impact: "広告表現を確認する必要があります。",
            adImpact: "LP と SNS の表示を確認する必要があります。",
            operator_checkpoints: ["広告表示を確認する"],
            sourceUrl: "https://example.com/ad-only",
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

    const result = await collectManualImpactEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId).sort()).toEqual([
      "consent-target",
      "current-change",
    ]);
    const current = result.entries.find((entry) => entry.analysis.changeId === "current-change");
    const consent = result.entries.find((entry) => entry.analysis.changeId === "consent-target");
    expect(current!.analysis.summary).toBe("新しい受付説明の要約");
    expect(current!.detectedDate).toBe("2026-05-28 00:00");
    expect(current!.selectionReasons).toEqual([
      "category",
      "summary",
      "impact",
      "operator_checkpoints",
    ]);
    expect(current!.manualReviewAreas).toContain("受付対応");
    expect(current!.manualReviewAreas).toContain("療養費請求フロー");
    expect(consent!.manualReviewAreas).toEqual([
      "同意書・リスク説明",
      "問診票",
      "スタッフ説明",
    ]);
  });

  it("uses JST calendar dates for raw detectedAt filtering", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-manual-impact-"));
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

    const result = await collectManualImpactEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries.map((entry) => entry.analysis.changeId).sort()).toEqual([
      "at-start",
      "before-end",
    ]);
  });

  it("rejects malformed dates before using them as file paths", async () => {
    await expect(collectManualImpactEntriesFromLogs("../outside")).rejects.toThrow(
      "Invalid date",
    );
  });

  it("does not select ad-only impact text", () => {
    expect(
      isManualImpactTarget(
        analysis({
          category: "広告表示",
          summary: "LP と SNS の広告表示を確認する更新です。",
          impact: "広告表現を確認する必要があります。",
          adImpact: "LP と SNS の表示を確認する必要があります。",
          operator_checkpoints: ["広告表示を確認する"],
        }),
      ),
    ).toBe(false);
  });

  it("does not select generic weak wording without a manual target context", () => {
    expect(
      isManualImpactTarget(
        analysis({
          category: "手続き",
          summary: "表示項目の説明が更新されました。",
          impact: "内容確認が必要です。",
          adImpact: "該当なし",
          operator_checkpoints: ["表示項目を確認する"],
        }),
      ),
    ).toBe(false);
  });

  it("selects patient-facing explanation changes as manual impact", () => {
    expect(
      isManualImpactTarget(
        analysis({
          category: "患者対応",
          summary: "患者への案内を見直す必要があります。",
          impact: "受付説明の更新が必要です。",
          adImpact: "該当なし",
          operator_checkpoints: ["患者説明を確認する"],
        }),
      ),
    ).toBe(true);
  });

  it("selects weak update wording when it appears with a concrete manual context", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-manual-impact-"));
    await mkdir(path.join(root, "data", "raw"), { recursive: true });

    await writeRaw(
      root,
      rawSnapshot({
        changeId: "weak-context",
        title: "Weak context",
        url: "https://example.com/weak-context",
      }),
    );
    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      `${JSON.stringify({
        at: "2026-05-28T00:00:00.000Z",
        changeId: "weak-context",
        status: "ok",
        analysis: analysis({
          changeId: "weak-context",
          category: "手続き",
          summary: "施術内容の説明を更新する必要があります。",
          impact: "現行資料との照合が必要です。",
          operator_checkpoints: ["説明内容を確認する"],
          sourceUrl: "https://example.com/weak-context",
        }),
      })}\n`,
      "utf8",
    );

    const result = await collectManualImpactEntriesFromLogs("2026-05-28", {
      root,
      timezone: "Asia/Tokyo",
    });

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0]!;
    expect(entry.selectionReasons).toEqual(["summary"]);
    expect(entry.manualReviewAreas).toEqual(["施術メニュー"]);
  });

  it("writes the manual impact report to reports/manual-impact", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-manual-impact-"));
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
        analysis: analysis({ summary: "院内影響要約" }),
      })}\n`,
      "utf8",
    );

    const reportPath = await regenerateManualImpactFromLogs("2026-05-28");
    const markdown = await readFile(reportPath, "utf8");

    expect(reportPath).toBe(
      path.join(root, "reports", "manual-impact", "2026-05-28_manual_impact.md"),
    );
    expect(markdown).toContain("type: legal-watch-manual-impact");
    expect(markdown).toContain("院内影響要約");
  });
});
