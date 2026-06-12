export type ChangeType = "new" | "updated" | "deleted" | "failed";
export type SourceWeight = "high" | "medium" | "low";
export type Importance = "high" | "medium" | "low";
export type Relevance = "high" | "medium" | "low";

export type WatchSourceType = "rss" | "html" | "api" | "pdf";

export interface PdfExcerpt {
  url: string;
  title?: string;
  textExcerpt: string;
  contentHash: string;
}

export interface PdfError {
  url: string;
  error: string;
}

export interface LinkedExcerpt {
  url: string;
  title?: string;
  textExcerpt: string;
}

export interface LinkedError {
  url: string;
  error: string;
}

export interface WatchTargetConfig {
  id: string;
  name: string;
  type: WatchSourceType;
  url: string;
  weight: SourceWeight;
  alwaysAnalyze: boolean;
  enabled: boolean;
  stableIdField?: string;
  itemsPath?: string;
  contentSelector?: string;
  followPdfLinks?: boolean;
  pdfLinkSelector?: string;
  pdfMaxLinks?: number;
  keywordProfile?: string;
}

export interface TargetState {
  contentHash: string;
  title?: string;
  lastFetchedAt: string;
  lastHttpStatus?: number;
  bodyExcerpt?: string;
  links?: string[];
  pdfs?: Record<string, { contentHash: string; textExcerpt?: string; title?: string }>;
  pdfErrors?: PdfError[];
}

export interface FetchSnapshot {
  sourceId: string;
  sourceName: string;
  targetKey: string;
  url: string;
  title: string;
  publishedAt?: string;
  bodyText: string;
  links: string[];
  pdfExcerpts?: PdfExcerpt[];
  pdfErrors?: PdfError[];
  contentHash: string;
  fetchedAt: string;
  httpStatus: number;
}

export interface DetectedChange {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceWeight: SourceWeight;
  targetKey: string;
  url: string;
  title: string;
  publishedAt?: string;
  detectedAt: string;
  changeType: ChangeType;
  diffText?: string;
  bodyExcerpt: string;
  links: string[];
  pdfExcerpts?: PdfExcerpt[];
  pdfErrors?: PdfError[];
  linkedExcerpts?: LinkedExcerpt[];
  linkedErrors?: LinkedError[];
  gatePass?: boolean;
  gateReasons?: string[];
  httpStatus?: number;
}

export interface SourceRun {
  sourceId: string;
  sourceName: string;
  status: "ok" | "empty" | "failed";
  url: string;
  httpStatus?: number;
  snapshotCount: number;
  changeCount: number;
  error?: string;
  note?: string;
}

export interface GateResult {
  pass: boolean;
  reasons: string[];
}

export interface Analysis {
  changeId: string;
  relevance: Relevance;
  importance: Importance;
  category: string;
  targetBusiness: string[];
  summary: string;
  whatChanged: string;
  impact: string;
  adImpact: string;
  operator_checkpoints: string[];
  needsOriginalCheck: boolean;
  needsLocalGovernmentCheck: boolean;
  needsExpertReview: boolean;
  confidence: number;
  unknowns: string[];
  sourceUrl: string;
  analyzedAt: string;
}

export interface RawSnapshot {
  changeId: string;
  sourceId?: string;
  sourceName?: string;
  sourceWeight?: SourceWeight;
  targetKey?: string;
  url: string;
  title: string;
  detectedAt: string;
  changeType: ChangeType;
  bodyExcerpt: string;
  diffText?: string;
  links?: string[];
  httpStatus?: number;
  pdfExcerpts?: PdfExcerpt[];
  pdfErrors?: PdfError[];
  linkedExcerpts?: LinkedExcerpt[];
  linkedErrors?: LinkedError[];
  gateReasons?: string[];
}

export interface DailyRunResult {
  date: string;
  sourceRuns?: SourceRun[];
  changes: DetectedChange[];
  analyses: Analysis[];
  gatedOut: DetectedChange[];
  failures: DetectedChange[];
  analysisFailures: { changeId: string; error: string }[];
  bootstrap?: boolean;
}
