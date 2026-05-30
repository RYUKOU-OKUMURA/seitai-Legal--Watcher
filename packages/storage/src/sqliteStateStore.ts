import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Analysis, RawSnapshot, TargetState } from "@seitai-legal-watch/core";
import type { StateData, StateStore } from "./stateStore.js";

const SCHEMA_VERSION = 1;
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

export const REVIEW_STATUSES = [
  "new",
  "reviewing",
  "confirmed",
  "action_required",
  "expert_review_required",
  "ignored",
  "archived",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface UpsertAnalysisInput {
  analysis: Analysis;
  raw: RawSnapshot;
  detectedDate?: string;
  importedAt?: string;
}

export interface ReviewAnalysisRecord {
  analysisId: string;
  changeId: string;
  sourceId?: string;
  sourceName?: string;
  sourceUrl: string;
  targetKey?: string;
  title?: string;
  detectedAt?: string;
  detectedDate?: string;
  changeType?: string;
  analyzedAt: string;
  relevance: string;
  importance: string;
  category: string;
  targetBusiness: string[];
  summary: string;
  whatChanged: string;
  impact: string;
  adImpact: string;
  operatorCheckpoints: string[];
  needsOriginalCheck: boolean;
  needsLocalGovernmentCheck: boolean;
  needsExpertReview: boolean;
  confidence: number;
  unknowns: string[];
  isLatest: boolean;
  importedAt: string;
  updatedAt: string;
}

export interface ReviewItem extends ReviewAnalysisRecord {
  status: ReviewStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  note?: string;
  statusCreatedAt: string;
  statusUpdatedAt: string;
}

export interface ListReviewItemsFilter {
  changeId?: string;
  date?: string;
  status?: ReviewStatus;
  latestOnly?: boolean;
}

export interface SetReviewStatusInput {
  analysisId?: string;
  changeId?: string;
  status: ReviewStatus;
  note?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  updatedAt?: string;
}

interface SqliteStateStoreOptions {
  dbPath?: string;
  now?: () => string;
}

type SqliteRow = Record<string, string | number | bigint | Uint8Array | null>;

function jsonArray(values: string[] | undefined): string {
  return JSON.stringify(values ?? []);
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function intToBool(value: string | number | bigint | Uint8Array | null | undefined): boolean {
  return Number(value ?? 0) === 1;
}

function textValue(row: SqliteRow, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function requiredText(row: SqliteRow, key: string): string {
  const value = textValue(row, key);
  if (value === undefined) throw new Error(`SQLite row is missing required column: ${key}`);
  return value;
}

function numberValue(row: SqliteRow, key: string): number {
  const value = row[key];
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function ensureOneIdentifier(input: { analysisId?: string; changeId?: string }): void {
  if (input.analysisId && input.changeId) {
    throw new Error("Use either analysisId or changeId, not both.");
  }
  if (!input.analysisId && !input.changeId) {
    throw new Error("analysisId or changeId is required.");
  }
}

export function isReviewStatus(value: string): value is ReviewStatus {
  return REVIEW_STATUSES.includes(value as ReviewStatus);
}

export function assertReviewStatus(value: string): asserts value is ReviewStatus {
  if (!isReviewStatus(value)) {
    throw new Error(`Invalid review status: ${value}. Expected one of ${REVIEW_STATUSES.join(", ")}.`);
  }
}

export function createAnalysisId(analysis: Analysis): string {
  const stablePayload = {
    changeId: analysis.changeId,
    analyzedAt: analysis.analyzedAt,
    relevance: analysis.relevance,
    importance: analysis.importance,
    category: analysis.category,
    targetBusiness: analysis.targetBusiness,
    summary: analysis.summary,
    whatChanged: analysis.whatChanged,
    impact: analysis.impact,
    adImpact: analysis.adImpact,
    operator_checkpoints: analysis.operator_checkpoints,
    needsOriginalCheck: analysis.needsOriginalCheck,
    needsLocalGovernmentCheck: analysis.needsLocalGovernmentCheck,
    needsExpertReview: analysis.needsExpertReview,
    confidence: analysis.confidence,
    unknowns: analysis.unknowns,
    sourceUrl: analysis.sourceUrl,
  };
  return `analysis_${createHash("sha256")
    .update(JSON.stringify(stablePayload))
    .digest("hex")
    .slice(0, 24)}`;
}

function defaultReviewStatus(analysis: Analysis): ReviewStatus {
  return analysis.needsExpertReview ? "expert_review_required" : "new";
}

function rowToReviewItem(row: SqliteRow): ReviewItem {
  const status = requiredText(row, "status");
  assertReviewStatus(status);

  return {
    analysisId: requiredText(row, "analysis_id"),
    changeId: requiredText(row, "change_id"),
    sourceId: textValue(row, "source_id"),
    sourceName: textValue(row, "source_name"),
    sourceUrl: requiredText(row, "source_url"),
    targetKey: textValue(row, "target_key"),
    title: textValue(row, "title"),
    detectedAt: textValue(row, "detected_at"),
    detectedDate: textValue(row, "detected_date"),
    changeType: textValue(row, "change_type"),
    analyzedAt: requiredText(row, "analyzed_at"),
    relevance: requiredText(row, "relevance"),
    importance: requiredText(row, "importance"),
    category: requiredText(row, "category"),
    targetBusiness: parseStringArray(textValue(row, "target_business_json")),
    summary: requiredText(row, "summary"),
    whatChanged: requiredText(row, "what_changed"),
    impact: requiredText(row, "impact"),
    adImpact: requiredText(row, "ad_impact"),
    operatorCheckpoints: parseStringArray(textValue(row, "operator_checkpoints_json")),
    needsOriginalCheck: intToBool(row.needs_original_check),
    needsLocalGovernmentCheck: intToBool(row.needs_local_government_check),
    needsExpertReview: intToBool(row.needs_expert_review),
    confidence: numberValue(row, "confidence"),
    unknowns: parseStringArray(textValue(row, "unknowns_json")),
    isLatest: intToBool(row.is_latest),
    importedAt: requiredText(row, "imported_at"),
    updatedAt: requiredText(row, "updated_at"),
    status,
    confirmedAt: textValue(row, "confirmed_at"),
    confirmedBy: textValue(row, "confirmed_by"),
    note: textValue(row, "note"),
    statusCreatedAt: requiredText(row, "status_created_at"),
    statusUpdatedAt: requiredText(row, "status_updated_at"),
  };
}

export class SqliteStateStore implements StateStore {
  private readonly db: DatabaseSyncType;
  private readonly dbPath: string;
  private readonly now: () => string;
  private closed = false;

  constructor(private readonly root: string, options: SqliteStateStoreOptions = {}) {
    this.dbPath = options.dbPath ?? path.join(root, "data", "watch.db");
    this.now = options.now ?? (() => new Date().toISOString());
    if (this.dbPath !== ":memory:") {
      mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  getRoot(): string {
    return this.root;
  }

  getDbPath(): string {
    return this.dbPath;
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  getSchemaVersion(): number {
    const row = this.db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as
      | SqliteRow
      | undefined;
    return Number(row?.version ?? 0);
  }

  upsertAnalysis(input: UpsertAnalysisInput): ReviewItem {
    const analysisId = createAnalysisId(input.analysis);
    const importedAt = input.importedAt ?? this.now();
    const detectedDate = input.detectedDate ?? input.raw.detectedAt.slice(0, 10);
    const sourceUrl = input.analysis.sourceUrl || input.raw.url;

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE analyses SET is_latest = 0, updated_at = ? WHERE change_id = ? AND analysis_id <> ?")
        .run(importedAt, input.analysis.changeId, analysisId);

      this.db
        .prepare(`
          INSERT INTO analyses (
            analysis_id,
            change_id,
            source_id,
            source_name,
            source_url,
            target_key,
            title,
            detected_at,
            detected_date,
            change_type,
            analyzed_at,
            relevance,
            importance,
            category,
            target_business_json,
            summary,
            what_changed,
            impact,
            ad_impact,
            operator_checkpoints_json,
            needs_original_check,
            needs_local_government_check,
            needs_expert_review,
            confidence,
            unknowns_json,
            analysis_json,
            raw_snapshot_json,
            is_latest,
            imported_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(analysis_id) DO UPDATE SET
            source_id = excluded.source_id,
            source_name = excluded.source_name,
            source_url = excluded.source_url,
            target_key = excluded.target_key,
            title = excluded.title,
            detected_at = excluded.detected_at,
            detected_date = excluded.detected_date,
            change_type = excluded.change_type,
            analyzed_at = excluded.analyzed_at,
            relevance = excluded.relevance,
            importance = excluded.importance,
            category = excluded.category,
            target_business_json = excluded.target_business_json,
            summary = excluded.summary,
            what_changed = excluded.what_changed,
            impact = excluded.impact,
            ad_impact = excluded.ad_impact,
            operator_checkpoints_json = excluded.operator_checkpoints_json,
            needs_original_check = excluded.needs_original_check,
            needs_local_government_check = excluded.needs_local_government_check,
            needs_expert_review = excluded.needs_expert_review,
            confidence = excluded.confidence,
            unknowns_json = excluded.unknowns_json,
            analysis_json = excluded.analysis_json,
            raw_snapshot_json = excluded.raw_snapshot_json,
            is_latest = 1,
            updated_at = excluded.updated_at
        `)
        .run(
          analysisId,
          input.analysis.changeId,
          input.raw.sourceId ?? null,
          input.raw.sourceName ?? null,
          sourceUrl,
          input.raw.targetKey ?? null,
          input.raw.title ?? null,
          input.raw.detectedAt,
          detectedDate,
          input.raw.changeType,
          input.analysis.analyzedAt,
          input.analysis.relevance,
          input.analysis.importance,
          input.analysis.category,
          jsonArray(input.analysis.targetBusiness),
          input.analysis.summary,
          input.analysis.whatChanged,
          input.analysis.impact,
          input.analysis.adImpact,
          jsonArray(input.analysis.operator_checkpoints),
          boolToInt(input.analysis.needsOriginalCheck),
          boolToInt(input.analysis.needsLocalGovernmentCheck),
          boolToInt(input.analysis.needsExpertReview),
          input.analysis.confidence,
          jsonArray(input.analysis.unknowns),
          JSON.stringify(input.analysis),
          JSON.stringify(input.raw),
          importedAt,
          importedAt,
        );

      this.db
        .prepare(`
          INSERT INTO review_statuses (
            analysis_id,
            change_id,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(analysis_id) DO NOTHING
        `)
        .run(
          analysisId,
          input.analysis.changeId,
          defaultReviewStatus(input.analysis),
          importedAt,
          importedAt,
        );

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }

    const item = this.getReviewItemByAnalysisId(analysisId);
    if (!item) throw new Error(`Imported analysis not found: ${analysisId}`);
    return item;
  }

  getReviewItemByAnalysisId(analysisId: string): ReviewItem | undefined {
    const row = this.db.prepare(`${this.reviewItemSelectSql()} WHERE a.analysis_id = ?`).get(analysisId) as
      | SqliteRow
      | undefined;
    return row ? rowToReviewItem(row) : undefined;
  }

  getLatestReviewItemByChangeId(changeId: string): ReviewItem | undefined {
    const row = this.db
      .prepare(
        `${this.reviewItemSelectSql()}
         WHERE a.change_id = ? AND a.is_latest = 1
         ORDER BY a.analyzed_at DESC, a.imported_at DESC
         LIMIT 1`,
      )
      .get(changeId) as SqliteRow | undefined;
    return row ? rowToReviewItem(row) : undefined;
  }

  listReviewItems(filter: ListReviewItemsFilter = {}): ReviewItem[] {
    const where: string[] = [];
    const params: string[] = [];

    if (filter.changeId) {
      where.push("a.change_id = ?");
      params.push(filter.changeId);
    }
    if (filter.date) {
      where.push("a.detected_date = ?");
      params.push(filter.date);
    }
    if (filter.status) {
      where.push("rs.status = ?");
      params.push(filter.status);
    }
    if (filter.latestOnly !== false) {
      where.push("a.is_latest = 1");
    }

    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `${this.reviewItemSelectSql()}${whereSql}
         ORDER BY a.detected_at DESC, a.analyzed_at DESC, a.imported_at DESC, a.change_id ASC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(rowToReviewItem);
  }

  setReviewStatus(input: SetReviewStatusInput): ReviewItem {
    assertReviewStatus(input.status);
    ensureOneIdentifier(input);

    const current = input.analysisId
      ? this.getReviewItemByAnalysisId(input.analysisId)
      : this.getLatestReviewItemByChangeId(input.changeId!);
    if (!current) {
      const id = input.analysisId ?? input.changeId;
      throw new Error(`Review item not found: ${id}`);
    }

    const updatedAt = input.updatedAt ?? this.now();
    const confirmedAt =
      input.status === "confirmed"
        ? input.confirmedAt ?? current.confirmedAt ?? updatedAt
        : null;
    const confirmedBy =
      input.status === "confirmed" ? input.confirmedBy ?? current.confirmedBy ?? null : null;
    const note = input.note !== undefined ? input.note : current.note ?? null;

    this.db
      .prepare(`
        UPDATE review_statuses
        SET status = ?,
            confirmed_at = ?,
            confirmed_by = ?,
            note = ?,
            updated_at = ?
        WHERE analysis_id = ?
      `)
      .run(input.status, confirmedAt, confirmedBy, note, updatedAt, current.analysisId);

    const updated = this.getReviewItemByAnalysisId(current.analysisId);
    if (!updated) throw new Error(`Updated review item not found: ${current.analysisId}`);
    return updated;
  }

  async loadState(): Promise<StateData> {
    return this.unimplementedStateStoreMethod();
  }

  async saveState(_state: StateData): Promise<void> {
    this.unimplementedStateStoreMethod();
  }

  async getTargetState(_targetKey: string): Promise<TargetState | undefined> {
    return this.unimplementedStateStoreMethod();
  }

  async upsertTargetState(_targetKey: string, _data: TargetState): Promise<void> {
    this.unimplementedStateStoreMethod();
  }

  async appendFetchLog(_entry: Record<string, unknown>): Promise<void> {
    this.unimplementedStateStoreMethod();
  }

  async appendLlmLog(_entry: Record<string, unknown>): Promise<void> {
    this.unimplementedStateStoreMethod();
  }

  async saveRawSnapshot(_snapshot: RawSnapshot): Promise<void> {
    this.unimplementedStateStoreMethod();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const currentVersion = this.getSchemaVersion();
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(
        `Unsupported SQLite schema version ${currentVersion}; this build supports ${SCHEMA_VERSION}.`,
      );
    }
    if (currentVersion >= 1) return;

    const appliedAt = this.now();
    this.db.exec("BEGIN");
    try {
      this.db.exec(`
        CREATE TABLE analyses (
          analysis_id TEXT PRIMARY KEY,
          change_id TEXT NOT NULL,
          source_id TEXT,
          source_name TEXT,
          source_url TEXT NOT NULL,
          target_key TEXT,
          title TEXT,
          detected_at TEXT,
          detected_date TEXT,
          change_type TEXT,
          analyzed_at TEXT NOT NULL,
          relevance TEXT NOT NULL,
          importance TEXT NOT NULL,
          category TEXT NOT NULL,
          target_business_json TEXT NOT NULL,
          summary TEXT NOT NULL,
          what_changed TEXT NOT NULL,
          impact TEXT NOT NULL,
          ad_impact TEXT NOT NULL,
          operator_checkpoints_json TEXT NOT NULL,
          needs_original_check INTEGER NOT NULL,
          needs_local_government_check INTEGER NOT NULL,
          needs_expert_review INTEGER NOT NULL,
          confidence REAL NOT NULL,
          unknowns_json TEXT NOT NULL,
          analysis_json TEXT NOT NULL,
          raw_snapshot_json TEXT,
          is_latest INTEGER NOT NULL DEFAULT 1,
          imported_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX analyses_change_latest_idx ON analyses(change_id, is_latest);
        CREATE INDEX analyses_detected_date_idx ON analyses(detected_date);
        CREATE INDEX analyses_importance_idx ON analyses(importance);

        CREATE TABLE review_statuses (
          analysis_id TEXT PRIMARY KEY,
          change_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (
            status IN (
              'new',
              'reviewing',
              'confirmed',
              'action_required',
              'expert_review_required',
              'ignored',
              'archived'
            )
          ),
          confirmed_at TEXT,
          confirmed_by TEXT,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(analysis_id) REFERENCES analyses(analysis_id) ON DELETE CASCADE
        );

        CREATE INDEX review_statuses_change_id_idx ON review_statuses(change_id);
        CREATE INDEX review_statuses_status_idx ON review_statuses(status);
      `);

      this.db
        .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(1, "phase4_review_status", appliedAt);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private reviewItemSelectSql(): string {
    return `
      SELECT
        a.analysis_id,
        a.change_id,
        a.source_id,
        a.source_name,
        a.source_url,
        a.target_key,
        a.title,
        a.detected_at,
        a.detected_date,
        a.change_type,
        a.analyzed_at,
        a.relevance,
        a.importance,
        a.category,
        a.target_business_json,
        a.summary,
        a.what_changed,
        a.impact,
        a.ad_impact,
        a.operator_checkpoints_json,
        a.needs_original_check,
        a.needs_local_government_check,
        a.needs_expert_review,
        a.confidence,
        a.unknowns_json,
        a.is_latest,
        a.imported_at,
        a.updated_at,
        rs.status,
        rs.confirmed_at,
        rs.confirmed_by,
        rs.note,
        rs.created_at AS status_created_at,
        rs.updated_at AS status_updated_at
      FROM analyses a
      INNER JOIN review_statuses rs ON rs.analysis_id = a.analysis_id
    `;
  }

  private unimplementedStateStoreMethod(): never {
    throw new Error(
      "SqliteStateStore only supports Phase 4 review status methods. Use JsonStateStore for fetch/raw/log state.",
    );
  }
}
