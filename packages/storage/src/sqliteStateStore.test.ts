import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import { describe, expect, it } from "vitest";
import {
  SqliteStateStore,
  createAnalysisId,
} from "./sqliteStateStore.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    changeId: "change-1",
    relevance: "high",
    importance: "medium",
    category: "療養費",
    targetBusiness: ["整骨院"],
    summary: "要約",
    whatChanged: "変更内容",
    impact: "実務影響",
    adImpact: "広告影響",
    operator_checkpoints: ["原典を確認する"],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.8,
    unknowns: [],
    sourceUrl: "https://example.com/change-1",
    analyzedAt: "2026-05-28T01:00:00.000Z",
    ...overrides,
  };
}

function rawSnapshot(overrides: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    changeId: "change-1",
    sourceId: "source-1",
    sourceName: "Source 1",
    sourceWeight: "medium",
    targetKey: "https://example.com/change-1",
    url: "https://example.com/change-1",
    title: "更新タイトル",
    detectedAt: "2026-05-27T15:00:00.000Z",
    changeType: "updated",
    bodyExcerpt: "本文抜粋",
    links: [],
    ...overrides,
  };
}

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "legal-watch-sqlite-"));
}

describe("SqliteStateStore review status", () => {
  it("creates data/watch.db and applies the review schema migration", async () => {
    const root = await tempRoot();
    const store = new SqliteStateStore(root, {
      now: () => "2026-05-30T00:00:00.000Z",
    });
    try {
      expect(store.getDbPath()).toBe(path.join(root, "data", "watch.db"));
      expect(store.getSchemaVersion()).toBe(1);
      await expect(stat(store.getDbPath())).resolves.toBeDefined();
    } finally {
      store.close();
    }
  });

  it("imports an Analysis idempotently and preserves manual review status", async () => {
    const root = await tempRoot();
    const store = new SqliteStateStore(root, {
      now: () => "2026-05-30T00:00:00.000Z",
    });
    const payload = analysis();
    try {
      const first = store.upsertAnalysis({
        analysis: payload,
        raw: rawSnapshot(),
        detectedDate: "2026-05-28",
      });
      expect(first.analysisId).toBe(createAnalysisId(payload));
      expect(first.status).toBe("new");

      const confirmed = store.setReviewStatus({
        analysisId: first.analysisId,
        status: "confirmed",
        note: "院内資料確認済み",
        confirmedBy: "operator",
        updatedAt: "2026-05-30T01:00:00.000Z",
      });
      expect(confirmed.confirmedAt).toBe("2026-05-30T01:00:00.000Z");

      store.upsertAnalysis({
        analysis: payload,
        raw: rawSnapshot(),
        detectedDate: "2026-05-28",
        importedAt: "2026-05-30T02:00:00.000Z",
      });

      const items = store.listReviewItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.status).toBe("confirmed");
      expect(items[0]!.note).toBe("院内資料確認済み");
    } finally {
      store.close();
    }
  });

  it("allows closing the SQLite store more than once", async () => {
    const root = await tempRoot();
    const store = new SqliteStateStore(root);

    store.close();

    expect(() => store.close()).not.toThrow();
  });

  it("marks a newer Analysis for the same changeId as latest and updates status by changeId", async () => {
    const root = await tempRoot();
    const store = new SqliteStateStore(root, {
      now: () => "2026-05-30T00:00:00.000Z",
    });
    try {
      const older = store.upsertAnalysis({
        analysis: analysis({ summary: "古い要約" }),
        raw: rawSnapshot(),
        detectedDate: "2026-05-28",
      });
      const newer = store.upsertAnalysis({
        analysis: analysis({
          summary: "新しい要約",
          analyzedAt: "2026-05-28T02:00:00.000Z",
        }),
        raw: rawSnapshot(),
        detectedDate: "2026-05-28",
      });

      expect(older.analysisId).not.toBe(newer.analysisId);
      expect(store.listReviewItems()).toHaveLength(1);
      expect(store.listReviewItems({ latestOnly: false })).toHaveLength(2);
      expect(store.getReviewItemByAnalysisId(older.analysisId)!.isLatest).toBe(false);
      expect(store.getReviewItemByAnalysisId(newer.analysisId)!.isLatest).toBe(true);

      const confirmed = store.setReviewStatus({
        changeId: "change-1",
        status: "confirmed",
        updatedAt: "2026-05-30T03:00:00.000Z",
      });
      expect(confirmed.analysisId).toBe(newer.analysisId);
      expect(store.getReviewItemByAnalysisId(older.analysisId)!.status).toBe("new");
    } finally {
      store.close();
    }
  });

  it("uses expert_review_required as the initial status when Analysis asks for expert review", async () => {
    const root = await tempRoot();
    const store = new SqliteStateStore(root);
    try {
      const item = store.upsertAnalysis({
        analysis: analysis({ needsExpertReview: true }),
        raw: rawSnapshot(),
        detectedDate: "2026-05-28",
      });
      expect(item.status).toBe("expert_review_required");
    } finally {
      store.close();
    }
  });

  it("rejects unsupported future schema versions", async () => {
    const root = await tempRoot();
    const dbPath = path.join(root, "data", "watch.db");
    await mkdir(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (999, 'future', '2026-05-30T00:00:00.000Z');
      `);
    } finally {
      db.close();
    }

    expect(() => new SqliteStateStore(root)).toThrow("Unsupported SQLite schema version");
  });
});
