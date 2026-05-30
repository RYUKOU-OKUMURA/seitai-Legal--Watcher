import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import matter from "gray-matter";
import {
  checklistReportPath,
  dailyReportPath,
  manualImpactReportPath,
  practicalDraftReportPath,
  resolveRepoRoot,
  weeklyReportPath,
} from "./paths.js";
import { isoWeekPeriod } from "./weeklyFromLogs.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface ObsidianSyncOptions {
  date?: string;
  force?: boolean;
  root?: string;
  vaultPath?: string;
}

export interface ObsidianWeeklySyncOptions {
  week: string;
  force?: boolean;
  root?: string;
  vaultPath?: string;
}

export interface ObsidianChecklistSyncOptions {
  date: string;
  force?: boolean;
  root?: string;
  vaultPath?: string;
}

export interface ObsidianManualImpactSyncOptions {
  date: string;
  force?: boolean;
  root?: string;
  vaultPath?: string;
}

export interface ObsidianDraftsSyncOptions {
  date: string;
  force?: boolean;
  root?: string;
  vaultPath?: string;
}

export interface ObsidianSyncResult {
  date: string;
  sourcePath: string;
  destinationPath: string;
  indexPath: string;
  topicPaths: string[];
  skippedTopicPaths: string[];
  skipped: boolean;
}

export interface ObsidianWeeklySyncResult {
  week: string;
  sourcePath: string;
  destinationPath: string;
  indexPath: string;
  skipped: boolean;
}

export interface ObsidianChecklistSyncResult {
  date: string;
  sourcePath: string;
  destinationPath: string;
  indexPath: string;
  skipped: boolean;
}

export interface ObsidianManualImpactSyncResult {
  date: string;
  sourcePath: string;
  destinationPath: string;
  indexPath: string;
  skipped: boolean;
}

export interface ObsidianDraftsSyncResult {
  date: string;
  sourcePath: string;
  destinationPath: string;
  indexPath: string;
  skipped: boolean;
}

interface DailyIndexEntry {
  date: string;
  fileName: string;
  contentUpdateCount?: number;
  analyzedCount?: number;
  gatedOutCount?: number;
  fetchFailureCount?: number;
}

interface WeeklyIndexEntry {
  week: string;
  fileName: string;
  periodStart?: string;
  periodEnd?: string;
  analyzedCount?: number;
}

interface ChecklistIndexEntry {
  date: string;
  fileName: string;
  targetCount?: number;
}

interface ManualImpactIndexEntry {
  date: string;
  fileName: string;
  targetCount?: number;
}

interface DraftsIndexEntry {
  date: string;
  fileName: string;
  targetCount?: number;
}

interface TopicItem {
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  category: string;
  targetBusiness: string[];
  relevance?: string;
  summary?: string;
  impact?: string;
  adImpact?: string;
  checkpoints: string[];
  needsExpertReview: boolean;
  unknowns: string[];
  originalBlock: string;
}

interface TopicWriteResult {
  topicPaths: string[];
  skippedTopicPaths: string[];
}

interface TopicIndexEntry {
  date: string;
  title: string;
  category: string;
  relativePath: string;
  sourceUrl?: string;
}

const SOURCE_TAG_RULES: { pattern: RegExp; tag: string }[] = [
  { pattern: /e-Gov/i, tag: "e-Gov" },
  { pattern: /官報/, tag: "官報" },
  { pattern: /消費者庁/, tag: "消費者庁" },
  { pattern: /厚生労働省|厚労省|厚生局/, tag: "厚労省" },
  { pattern: /自治体|東京都|神奈川県|北海道|大阪府|京都府|県|市|区|保健所/, tag: "自治体通知" },
];

function hasErrorCode(err: unknown, code: string): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}

function resolveReportDate(date?: string): string {
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
    }
    const parsed = dayjs(date);
    if (!parsed.isValid() || parsed.format("YYYY-MM-DD") !== date) {
      throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
    }
    return date;
  }
  const tz = process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  return dayjs().tz(tz).format("YYYY-MM-DD");
}

function resolveReportWeek(week: string): string {
  return isoWeekPeriod(week).week;
}

function resolveVaultPath(vaultPath?: string): string {
  const configured = vaultPath ?? process.env.LEGAL_WATCH_OBSIDIAN_VAULT_PATH;
  if (!configured) {
    throw new Error(
      "LEGAL_WATCH_OBSIDIAN_VAULT_PATH is not set. Add it to .env or export it before running sync-obsidian.",
    );
  }
  return path.resolve(configured);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readDailyReport(sourcePath: string, date: string): Promise<string> {
  try {
    return await readFile(sourcePath, "utf8");
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) {
      throw new Error(
        `Daily report not found: ${sourcePath}. Run pnpm daily or pnpm report for ${date} before syncing Obsidian.`,
      );
    }
    throw err;
  }
}

async function readWeeklyReport(sourcePath: string, week: string): Promise<string> {
  try {
    return await readFile(sourcePath, "utf8");
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) {
      throw new Error(
        `Weekly report not found: ${sourcePath}. Run pnpm weekly -- --week ${week} before syncing Obsidian.`,
      );
    }
    throw err;
  }
}

async function readChecklistReport(sourcePath: string, date: string): Promise<string> {
  try {
    return await readFile(sourcePath, "utf8");
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) {
      throw new Error(
        `Ad checklist not found: ${sourcePath}. Run pnpm checklist -- --date ${date} before syncing Obsidian.`,
      );
    }
    throw err;
  }
}

async function readManualImpactReport(sourcePath: string, date: string): Promise<string> {
  try {
    return await readFile(sourcePath, "utf8");
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) {
      throw new Error(
        `Manual impact report not found: ${sourcePath}. Run pnpm manual-impact -- --date ${date} before syncing Obsidian.`,
      );
    }
    throw err;
  }
}

async function readDraftsReport(sourcePath: string, date: string): Promise<string> {
  try {
    return await readFile(sourcePath, "utf8");
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) {
      throw new Error(
        `Practical drafts report not found: ${sourcePath}. Run pnpm drafts -- --date ${date} before syncing Obsidian.`,
      );
    }
    throw err;
  }
}

function normalizeDateValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function normalizeTag(value: string): string | undefined {
  const tag = value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[\\/#\[\]|]/g, "");
  return tag.length > 0 ? tag : undefined;
}

function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = normalizeTag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function frontmatterTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof value === "string") {
    return value.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

function sourceTag(sourceName: string): string | undefined {
  return SOURCE_TAG_RULES.find((rule) => rule.pattern.test(sourceName))?.tag;
}

function topicTags(topic: TopicItem): string[] {
  return normalizeTags([
    "legal-watch",
    "法令監視",
    topic.category,
    ...(topic.sourceName ? [sourceTag(topic.sourceName) ?? ""] : []),
    ...topic.targetBusiness,
    ...(topic.needsExpertReview ? ["要専門家確認"] : []),
  ]);
}

function deriveObsidianTags(content: string): string[] {
  const tags = ["legal-watch", "法令監視"];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const source = trimmed.match(/^-\s*情報源:\s*(.+)$/);
    if (source?.[1]) {
      const tag = sourceTag(source[1]);
      if (tag) tags.push(tag);
      continue;
    }

    const bootstrapSource = trimmed.match(/^-\s*\[[^\]]+\]\s*([^:：]+)[:：]/);
    if (bootstrapSource?.[1]) {
      const tag = sourceTag(bootstrapSource[1]);
      if (tag) tags.push(tag);
      continue;
    }

    const category = trimmed.match(/^-\s*カテゴリ:\s*(.+)$/);
    if (category?.[1]) {
      tags.push(category[1]);
      continue;
    }

    const targetBusiness = trimmed.match(/^-\s*対象業態:\s*(.+)$/);
    if (targetBusiness?.[1]) {
      tags.push(...targetBusiness[1].split(/[、,／/]+/));
      continue;
    }

    if (trimmed === "> 要専門家確認") {
      tags.push("要専門家確認");
    }
  }
  return normalizeTags(tags);
}

export function enrichDailyMarkdownForObsidian(markdown: string): string {
  const parsed = matter(markdown);
  const data: Record<string, unknown> = { ...parsed.data };
  if ("date" in data) data.date = normalizeDateValue(data.date);
  data.tags = normalizeTags([
    ...frontmatterTags(data.tags),
    ...deriveObsidianTags(parsed.content),
  ]);
  return matter.stringify(parsed.content, data);
}

export function enrichWeeklyMarkdownForObsidian(markdown: string): string {
  const parsed = matter(markdown);
  const data: Record<string, unknown> = { ...parsed.data };
  if ("period_start" in data) data.period_start = normalizeDateValue(data.period_start);
  if ("period_end" in data) data.period_end = normalizeDateValue(data.period_end);
  data.tags = normalizeTags([
    ...frontmatterTags(data.tags),
    "legal-watch",
    "法令監視",
    "週次",
  ]);
  return matter.stringify(parsed.content, data);
}

export function enrichChecklistMarkdownForObsidian(markdown: string): string {
  const parsed = matter(markdown);
  const data: Record<string, unknown> = { ...parsed.data };
  if ("date" in data) data.date = normalizeDateValue(data.date);
  data.tags = normalizeTags([
    ...frontmatterTags(data.tags),
    "legal-watch",
    "法令監視",
    "広告チェック",
  ]);
  return matter.stringify(parsed.content, data);
}

export function enrichManualImpactMarkdownForObsidian(markdown: string): string {
  const parsed = matter(markdown);
  const data: Record<string, unknown> = { ...parsed.data };
  if ("date" in data) data.date = normalizeDateValue(data.date);
  data.tags = normalizeTags([
    ...frontmatterTags(data.tags),
    "legal-watch",
    "法令監視",
    "院内影響確認",
  ]);
  return matter.stringify(parsed.content, data);
}

export function enrichDraftsMarkdownForObsidian(markdown: string): string {
  const parsed = matter(markdown);
  const data: Record<string, unknown> = { ...parsed.data };
  if ("date" in data) data.date = normalizeDateValue(data.date);
  data.tags = normalizeTags([
    ...frontmatterTags(data.tags),
    "legal-watch",
    "法令監視",
    "転用下書き",
  ]);
  return matter.stringify(parsed.content, data);
}

function legalWatchRoot(vaultPath: string): string {
  return path.join(vaultPath, "Legal Watch");
}

function dailyDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "daily");
}

function weeklyDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "weekly");
}

function checklistsDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "checklists");
}

function manualImpactDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "manual-impact");
}

function draftsDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "drafts");
}

function topicsDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "topics");
}

function indexPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "index.md");
}

function countValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function dateValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return fallback;
}

function optionalDateValue(value: unknown): string | undefined {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return undefined;
}

function weekValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^\d{4}-W\d{2}$/.test(value)) {
    return value;
  }
  return fallback;
}

async function loadDailyIndexEntries(dailyDir: string): Promise<DailyIndexEntry[]> {
  let files: string[] = [];
  try {
    files = await readdir(dailyDir);
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) return [];
    throw err;
  }

  const entries: DailyIndexEntry[] = [];
  for (const fileName of files) {
    const fileDate = fileName.match(/^(\d{4}-\d{2}-\d{2})\.md$/)?.[1];
    if (!fileDate) continue;
    const raw = await readFile(path.join(dailyDir, fileName), "utf8");
    const parsed = matter(raw);
    entries.push({
      date: dateValue(parsed.data.date, fileDate),
      fileName,
      contentUpdateCount: countValue(parsed.data.content_update_count),
      analyzedCount: countValue(parsed.data.analyzed_count),
      gatedOutCount: countValue(parsed.data.gated_out_count),
      fetchFailureCount: countValue(parsed.data.fetch_failure_count),
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

async function loadWeeklyIndexEntries(weeklyDir: string): Promise<WeeklyIndexEntry[]> {
  let files: string[] = [];
  try {
    files = await readdir(weeklyDir);
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) return [];
    throw err;
  }

  const entries: WeeklyIndexEntry[] = [];
  for (const fileName of files) {
    const fileWeek = fileName.match(/^(\d{4}-W\d{2})_legal_watch\.md$/)?.[1];
    if (!fileWeek) continue;
    const raw = await readFile(path.join(weeklyDir, fileName), "utf8");
    const parsed = matter(raw);
    entries.push({
      week: weekValue(parsed.data.week, fileWeek),
      fileName,
      periodStart: optionalDateValue(parsed.data.period_start),
      periodEnd: optionalDateValue(parsed.data.period_end),
      analyzedCount: countValue(parsed.data.analyzed_count),
    });
  }
  return entries.sort((a, b) => b.week.localeCompare(a.week));
}

async function loadChecklistIndexEntries(
  checklistsDir: string,
): Promise<ChecklistIndexEntry[]> {
  let files: string[] = [];
  try {
    files = await readdir(checklistsDir);
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) return [];
    throw err;
  }

  const entries: ChecklistIndexEntry[] = [];
  for (const fileName of files) {
    const fileDate = fileName.match(/^(\d{4}-\d{2}-\d{2})_ad_checklist\.md$/)?.[1];
    if (!fileDate) continue;
    const raw = await readFile(path.join(checklistsDir, fileName), "utf8");
    const parsed = matter(raw);
    entries.push({
      date: dateValue(parsed.data.date, fileDate),
      fileName,
      targetCount: countValue(parsed.data.target_count),
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

async function loadManualImpactIndexEntries(
  manualImpactDir: string,
): Promise<ManualImpactIndexEntry[]> {
  let files: string[] = [];
  try {
    files = await readdir(manualImpactDir);
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) return [];
    throw err;
  }

  const entries: ManualImpactIndexEntry[] = [];
  for (const fileName of files) {
    const fileDate = fileName.match(/^(\d{4}-\d{2}-\d{2})_manual_impact\.md$/)?.[1];
    if (!fileDate) continue;
    const raw = await readFile(path.join(manualImpactDir, fileName), "utf8");
    const parsed = matter(raw);
    entries.push({
      date: dateValue(parsed.data.date, fileDate),
      fileName,
      targetCount: countValue(parsed.data.target_count),
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

async function loadDraftsIndexEntries(
  draftsDir: string,
): Promise<DraftsIndexEntry[]> {
  let files: string[] = [];
  try {
    files = await readdir(draftsDir);
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) return [];
    throw err;
  }

  const entries: DraftsIndexEntry[] = [];
  for (const fileName of files) {
    const fileDate = fileName.match(/^(\d{4}-\d{2}-\d{2})_practical_drafts\.md$/)?.[1];
    if (!fileDate) continue;
    const raw = await readFile(path.join(draftsDir, fileName), "utf8");
    const parsed = matter(raw);
    entries.push({
      date: dateValue(parsed.data.date, fileDate),
      fileName,
      targetCount: countValue(parsed.data.target_count),
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function safePathSegment(value: string, fallback: string): string {
  const cleaned = value
    .normalize("NFKC")
    .trim()
    .replace(/[\\/:*?"<>|\[\]#\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

function bulletValue(lines: string[], label: string): string | undefined {
  const match = lines
    .map((line) => line.trim())
    .find((line) => line.startsWith(`- ${label}:`))
    ?.match(/^-\s*[^:]+:\s*(.+)$/);
  return match?.[1]?.trim();
}

function sectionParagraph(lines: string[], heading: string): string | undefined {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return undefined;
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (values.length > 0) break;
      continue;
    }
    if (trimmed.startsWith("**") || trimmed.startsWith("> ") || trimmed.startsWith("### ")) break;
    values.push(trimmed);
  }
  return values.length > 0 ? values.join("\n") : undefined;
}

function sectionList(lines: string[], start: number): string[] {
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (values.length > 0) break;
      continue;
    }
    if (!trimmed.startsWith("- ")) break;
    values.push(trimmed.replace(/^-\s*/, ""));
  }
  return values;
}

function checkpoints(lines: string[]): string[] {
  const knownHeadings = new Set([
    "**要約**",
    "**実務影響（要確認）**",
    "**広告・LP・SNS（要確認）**",
    "**PDF抜粋（要原典確認）**",
    "**PDF抽出失敗**",
    "**不明点**",
  ]);
  const start = lines.findIndex((line) => {
    const trimmed = line.trim();
    return /^(\*\*).+(\*\*)$/.test(trimmed) && !knownHeadings.has(trimmed);
  });
  return start === -1 ? [] : sectionList(lines, start);
}

function unknowns(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() === "**不明点**");
  return start === -1 ? [] : sectionList(lines, start);
}

function parseTargetBusiness(value: string | undefined): string[] {
  return value ? value.split(/[、,／/]+/).map((item) => item.trim()).filter(Boolean) : [];
}

function parseTopicBlock(lines: string[], title: string): TopicItem {
  const category = bulletValue(lines, "カテゴリ") ?? "未分類";
  return {
    title,
    sourceName: bulletValue(lines, "情報源"),
    sourceUrl: bulletValue(lines, "原典"),
    category,
    targetBusiness: parseTargetBusiness(bulletValue(lines, "対象業態")),
    relevance: bulletValue(lines, "関連度"),
    summary: sectionParagraph(lines, "**要約**"),
    impact: sectionParagraph(lines, "**実務影響（要確認）**"),
    adImpact: sectionParagraph(lines, "**広告・LP・SNS（要確認）**"),
    checkpoints: checkpoints(lines),
    needsExpertReview: lines.some((line) => line.trim() === "> 要専門家確認"),
    unknowns: unknowns(lines),
    originalBlock: lines.join("\n").trim(),
  };
}

function parseHighTopicsFromDailyMarkdown(markdown: string): TopicItem[] {
  const parsed = matter(markdown);
  const lines = parsed.content.split(/\r?\n/);
  const topics: TopicItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]?.match(/^### \[(high|medium|low)\]\s+(.+)$/);
    if (!heading) continue;
    const importance = heading[1];
    const title = heading[2]?.trim() ?? "無題";
    let end = index + 1;
    while (
      end < lines.length &&
      !/^### \[(high|medium|low)\]/.test(lines[end] ?? "") &&
      !/^##\s+/.test(lines[end] ?? "")
    ) {
      end += 1;
    }
    if (importance === "high") {
      topics.push(parseTopicBlock(lines.slice(index, end), title));
    }
  }

  return topics;
}

function topicFilePath(
  vaultPath: string,
  date: string,
  topic: TopicItem,
  plannedPaths: Set<string>,
): string {
  const category = safePathSegment(topic.category, "未分類");
  const title = safePathSegment(topic.title, "無題");
  const base = path.join(topicsDirPath(vaultPath), category, `${date}_${title}`);
  let candidate = `${base}.md`;
  let suffix = 2;
  while (plannedPaths.has(candidate)) {
    candidate = `${base}-${suffix}.md`;
    suffix += 1;
  }
  plannedPaths.add(candidate);
  return candidate;
}

function sourceReportLink(date: string): string {
  return `[[daily/${date}|${date}]]`;
}

function markdownList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- （記載なし）"];
}

function topicNoteMarkdown(topic: TopicItem, date: string): string {
  const data: Record<string, unknown> = {
    type: "legal-watch-topic",
    date,
    importance: "high",
    category: topic.category,
    source_report: `daily/${date}`,
    tags: topicTags(topic),
  };
  if (topic.sourceUrl) data.source_url = topic.sourceUrl;

  const lines = [
    `# ${topic.title}`,
    "",
    `- 日次レポート: ${sourceReportLink(date)}`,
    ...(topic.sourceName ? [`- 情報源: ${topic.sourceName}`] : []),
    ...(topic.sourceUrl ? [`- 原典: ${topic.sourceUrl}`] : []),
    `- カテゴリ: ${topic.category}`,
    ...(topic.targetBusiness.length > 0 ? [`- 対象業態: ${topic.targetBusiness.join("、")}`] : []),
    ...(topic.relevance ? [`- 関連度: ${topic.relevance}`] : []),
    "",
    "## 要約",
    topic.summary ?? "（記載なし）",
    "",
    "## 実務影響",
    topic.impact ?? "（記載なし）",
    "",
    "## 広告・LP・SNS",
    topic.adImpact ?? "（記載なし）",
    "",
    "## 確認ポイント",
    ...markdownList(topic.checkpoints),
    "",
    ...(topic.needsExpertReview ? ["> 要専門家確認", ""] : []),
    ...(topic.unknowns.length > 0 ? ["## 不明点", ...markdownList(topic.unknowns), ""] : []),
    "## 日次レポート抜粋",
    "",
    "```md",
    topic.originalBlock,
    "```",
    "",
  ];

  return matter.stringify(lines.join("\n"), data);
}

async function writeTopicNotes(
  vaultPath: string,
  date: string,
  dailyMarkdown: string,
  force: boolean,
): Promise<TopicWriteResult> {
  const plannedPaths = new Set<string>();
  const topicPaths: string[] = [];
  const skippedTopicPaths: string[] = [];

  for (const topic of parseHighTopicsFromDailyMarkdown(dailyMarkdown)) {
    const destinationPath = topicFilePath(vaultPath, date, topic, plannedPaths);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    if ((await fileExists(destinationPath)) && !force) {
      skippedTopicPaths.push(destinationPath);
      continue;
    }
    await writeFile(destinationPath, topicNoteMarkdown(topic, date), {
      encoding: "utf8",
      flag: force ? "w" : "wx",
    });
    topicPaths.push(destinationPath);
  }

  return { topicPaths, skippedTopicPaths };
}

function countCell(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function markdownUrl(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "%20")
    .replace(/\)/g, "%29")
    .replace(/\|/g, "%7C");
}

function obsidianLink(relativePath: string, label: string): string {
  return `[[${relativePath}|${label.replace(/[|[\]]/g, "｜")}]]`;
}

function firstHeading(content: string): string | undefined {
  return content
    .split(/\r?\n/)
    .find((line) => line.startsWith("# "))
    ?.replace(/^#\s+/, "")
    .trim();
}

async function collectTopicIndexEntries(
  rootDir: string,
  relativeDir = "",
): Promise<TopicIndexEntry[]> {
  let entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  const topics: TopicIndexEntry[] = [];

  entries = entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    const fullPath = path.join(rootDir, relativePath);
    if (entry.isDirectory()) {
      topics.push(...await collectTopicIndexEntries(rootDir, relativePath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const raw = await readFile(fullPath, "utf8");
    const parsed = matter(raw);
    if (
      parsed.data.type !== "legal-watch-topic" ||
      parsed.data.importance !== "high"
    ) {
      continue;
    }
    const fileDate = entry.name.match(/^(\d{4}-\d{2}-\d{2})_/)?.[1] ?? "0000-00-00";
    const date = dateValue(parsed.data.date, fileDate);
    const title =
      firstHeading(parsed.content) ??
      entry.name.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, "");
    topics.push({
      date,
      title,
      category:
        typeof parsed.data.category === "string"
          ? parsed.data.category
          : relativeDir.split(path.sep).filter(Boolean)[0] ?? "未分類",
      relativePath: path.join("topics", relativePath).replace(/\.md$/, "").split(path.sep).join("/"),
      sourceUrl:
        typeof parsed.data.source_url === "string"
          ? parsed.data.source_url
          : undefined,
    });
  }

  return topics.sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
  );
}

async function loadTopicIndexEntries(vaultPath: string): Promise<TopicIndexEntry[]> {
  const rootDir = topicsDirPath(vaultPath);
  try {
    return await collectTopicIndexEntries(rootDir);
  } catch (err) {
    if (hasErrorCode(err, "ENOENT")) return [];
    throw err;
  }
}

function generateObsidianIndexMarkdown(
  dailyEntries: DailyIndexEntry[],
  weeklyEntries: WeeklyIndexEntry[],
  checklistEntries: ChecklistIndexEntry[],
  manualImpactEntries: ManualImpactIndexEntry[],
  draftsEntries: DraftsIndexEntry[],
  topicEntries: TopicIndexEntry[],
): string {
  const lines = [
    "# Legal Watch",
    "",
    "> このファイルは `legal-watch sync-obsidian` により自動生成されます。手動編集は次回同期時に上書きされます。",
    "",
    "## 最近の日次レポート",
    "",
  ];

  if (dailyEntries.length === 0) {
    lines.push("同期済みの日次レポートはありません。", "");
  } else {
    lines.push(
      "| レポート | 内容更新 | 分析済み | 参考・未分析 | 取得失敗 |",
      "|---|---:|---:|---:|---:|",
    );
    for (const entry of dailyEntries) {
      lines.push(
        `| [[daily/${entry.fileName.replace(/\.md$/, "")}|${entry.date}]] | ${countCell(entry.contentUpdateCount)} | ${countCell(entry.analyzedCount)} | ${countCell(entry.gatedOutCount)} | ${countCell(entry.fetchFailureCount)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 最近の週次レポート", "");
  if (weeklyEntries.length === 0) {
    lines.push("同期済みの週次レポートはありません。", "");
  } else {
    lines.push(
      "| レポート | 対象期間 | 分析済み |",
      "|---|---|---:|",
    );
    for (const entry of weeklyEntries) {
      const reportLink = `[[weekly/${entry.fileName.replace(/\.md$/, "")}|${entry.week}]]`;
      const period =
        entry.periodStart && entry.periodEnd
          ? `${entry.periodStart}〜${entry.periodEnd}`
          : "-";
      lines.push(
        `| ${reportLink} | ${tableCell(period)} | ${countCell(entry.analyzedCount)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 最近の広告チェックリスト", "");
  if (checklistEntries.length === 0) {
    lines.push("同期済みの広告チェックリストはありません。", "");
  } else {
    lines.push("| チェックリスト | 対象項目 |", "|---|---:|");
    for (const entry of checklistEntries) {
      const checklistLink = `[[checklists/${entry.fileName.replace(/\.md$/, "")}|${entry.date}]]`;
      lines.push(`| ${checklistLink} | ${countCell(entry.targetCount)} |`);
    }
    lines.push("");
  }

  lines.push("## 最近の院内影響確認", "");
  if (manualImpactEntries.length === 0) {
    lines.push("同期済みの院内影響確認はありません。", "");
  } else {
    lines.push("| 確認ファイル | 対象項目 |", "|---|---:|");
    for (const entry of manualImpactEntries) {
      const manualImpactLink = `[[manual-impact/${entry.fileName.replace(/\.md$/, "")}|${entry.date}]]`;
      lines.push(`| ${manualImpactLink} | ${countCell(entry.targetCount)} |`);
    }
    lines.push("");
  }

  lines.push("## 最近の転用下書き", "");
  if (draftsEntries.length === 0) {
    lines.push("同期済みの転用下書きはありません。", "");
  } else {
    lines.push("| 下書き | 対象項目 |", "|---|---:|");
    for (const entry of draftsEntries) {
      const draftsLink = `[[drafts/${entry.fileName.replace(/\.md$/, "")}|${entry.date}]]`;
      lines.push(`| ${draftsLink} | ${countCell(entry.targetCount)} |`);
    }
    lines.push("");
  }

  lines.push("## 重要度高トピック", "");
  if (topicEntries.length === 0) {
    lines.push("生成済みの重要度高トピックはありません。", "");
    return lines.join("\n");
  }

  lines.push(
    "| トピック | カテゴリ | 日付 | 原典 |",
    "|---|---|---:|---|",
  );
  for (const topic of topicEntries) {
    lines.push(
      `| ${obsidianLink(topic.relativePath, topic.title)} | ${tableCell(topic.category)} | ${topic.date} | ${topic.sourceUrl ? `[あり](${markdownUrl(topic.sourceUrl)})` : "-"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function writeObsidianIndex(vaultPath: string): Promise<string> {
  const dailyDir = dailyDirPath(vaultPath);
  const weeklyDir = weeklyDirPath(vaultPath);
  const checklistDir = checklistsDirPath(vaultPath);
  const manualImpactDir = manualImpactDirPath(vaultPath);
  const draftsDir = draftsDirPath(vaultPath);
  const destinationPath = indexPath(vaultPath);
  const dailyEntries = await loadDailyIndexEntries(dailyDir);
  const weeklyEntries = await loadWeeklyIndexEntries(weeklyDir);
  const checklistEntries = await loadChecklistIndexEntries(checklistDir);
  const manualImpactEntries = await loadManualImpactIndexEntries(manualImpactDir);
  const draftsEntries = await loadDraftsIndexEntries(draftsDir);
  const topicEntries = await loadTopicIndexEntries(vaultPath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(
    destinationPath,
    generateObsidianIndexMarkdown(
      dailyEntries,
      weeklyEntries,
      checklistEntries,
      manualImpactEntries,
      draftsEntries,
      topicEntries,
    ),
    "utf8",
  );
  return destinationPath;
}

export async function syncDailyReportToObsidian(
  options: ObsidianSyncOptions = {},
): Promise<ObsidianSyncResult> {
  const date = resolveReportDate(options.date);
  const root = options.root ?? resolveRepoRoot();
  const vaultPath = resolveVaultPath(options.vaultPath);
  const sourcePath = dailyReportPath(root, date);
  const destinationPath = path.join(dailyDirPath(vaultPath), `${date}.md`);
  const sourceMarkdown = await readDailyReport(sourcePath, date);

  await mkdir(path.dirname(destinationPath), { recursive: true });

  let skipped = false;
  if ((await fileExists(destinationPath)) && options.force !== true) {
    skipped = true;
  } else {
    try {
      await writeFile(
        destinationPath,
        enrichDailyMarkdownForObsidian(sourceMarkdown),
        {
          encoding: "utf8",
          flag: options.force === true ? "w" : "wx",
        },
      );
    } catch (err) {
      if (hasErrorCode(err, "EEXIST") && options.force !== true) {
        skipped = true;
      } else {
        throw err;
      }
    }
  }

  const syncedDailyMarkdown = await readFile(destinationPath, "utf8");
  const topicResult = await writeTopicNotes(
    vaultPath,
    date,
    syncedDailyMarkdown,
    options.force === true,
  );
  const writtenIndexPath = await writeObsidianIndex(vaultPath);
  return {
    date,
    sourcePath,
    destinationPath,
    indexPath: writtenIndexPath,
    topicPaths: topicResult.topicPaths,
    skippedTopicPaths: topicResult.skippedTopicPaths,
    skipped,
  };
}

export async function syncWeeklyReportToObsidian(
  options: ObsidianWeeklySyncOptions,
): Promise<ObsidianWeeklySyncResult> {
  const week = resolveReportWeek(options.week);
  const root = options.root ?? resolveRepoRoot();
  const vaultPath = resolveVaultPath(options.vaultPath);
  const sourcePath = weeklyReportPath(root, week);
  const destinationPath = path.join(
    weeklyDirPath(vaultPath),
    `${week}_legal_watch.md`,
  );
  const sourceMarkdown = await readWeeklyReport(sourcePath, week);

  await mkdir(path.dirname(destinationPath), { recursive: true });

  let skipped = false;
  if ((await fileExists(destinationPath)) && options.force !== true) {
    skipped = true;
  } else {
    try {
      await writeFile(
        destinationPath,
        enrichWeeklyMarkdownForObsidian(sourceMarkdown),
        {
          encoding: "utf8",
          flag: options.force === true ? "w" : "wx",
        },
      );
    } catch (err) {
      if (hasErrorCode(err, "EEXIST") && options.force !== true) {
        skipped = true;
      } else {
        throw err;
      }
    }
  }

  const writtenIndexPath = await writeObsidianIndex(vaultPath);
  return {
    week,
    sourcePath,
    destinationPath,
    indexPath: writtenIndexPath,
    skipped,
  };
}

export async function syncChecklistReportToObsidian(
  options: ObsidianChecklistSyncOptions,
): Promise<ObsidianChecklistSyncResult> {
  const date = resolveReportDate(options.date);
  const root = options.root ?? resolveRepoRoot();
  const vaultPath = resolveVaultPath(options.vaultPath);
  const sourcePath = checklistReportPath(root, date);
  const destinationPath = path.join(
    checklistsDirPath(vaultPath),
    `${date}_ad_checklist.md`,
  );
  const sourceMarkdown = await readChecklistReport(sourcePath, date);

  await mkdir(path.dirname(destinationPath), { recursive: true });

  let skipped = false;
  if ((await fileExists(destinationPath)) && options.force !== true) {
    skipped = true;
  } else {
    try {
      await writeFile(
        destinationPath,
        enrichChecklistMarkdownForObsidian(sourceMarkdown),
        {
          encoding: "utf8",
          flag: options.force === true ? "w" : "wx",
        },
      );
    } catch (err) {
      if (hasErrorCode(err, "EEXIST") && options.force !== true) {
        skipped = true;
      } else {
        throw err;
      }
    }
  }

  const writtenIndexPath = await writeObsidianIndex(vaultPath);
  return {
    date,
    sourcePath,
    destinationPath,
    indexPath: writtenIndexPath,
    skipped,
  };
}

export async function syncManualImpactReportToObsidian(
  options: ObsidianManualImpactSyncOptions,
): Promise<ObsidianManualImpactSyncResult> {
  const date = resolveReportDate(options.date);
  const root = options.root ?? resolveRepoRoot();
  const vaultPath = resolveVaultPath(options.vaultPath);
  const sourcePath = manualImpactReportPath(root, date);
  const destinationPath = path.join(
    manualImpactDirPath(vaultPath),
    `${date}_manual_impact.md`,
  );
  const sourceMarkdown = await readManualImpactReport(sourcePath, date);

  await mkdir(path.dirname(destinationPath), { recursive: true });

  let skipped = false;
  if ((await fileExists(destinationPath)) && options.force !== true) {
    skipped = true;
  } else {
    try {
      await writeFile(
        destinationPath,
        enrichManualImpactMarkdownForObsidian(sourceMarkdown),
        {
          encoding: "utf8",
          flag: options.force === true ? "w" : "wx",
        },
      );
    } catch (err) {
      if (hasErrorCode(err, "EEXIST") && options.force !== true) {
        skipped = true;
      } else {
        throw err;
      }
    }
  }

  const writtenIndexPath = await writeObsidianIndex(vaultPath);
  return {
    date,
    sourcePath,
    destinationPath,
    indexPath: writtenIndexPath,
    skipped,
  };
}

export async function syncDraftsReportToObsidian(
  options: ObsidianDraftsSyncOptions,
): Promise<ObsidianDraftsSyncResult> {
  const date = resolveReportDate(options.date);
  const root = options.root ?? resolveRepoRoot();
  const vaultPath = resolveVaultPath(options.vaultPath);
  const sourcePath = practicalDraftReportPath(root, date);
  const destinationPath = path.join(
    draftsDirPath(vaultPath),
    `${date}_practical_drafts.md`,
  );
  const sourceMarkdown = await readDraftsReport(sourcePath, date);

  await mkdir(path.dirname(destinationPath), { recursive: true });

  let skipped = false;
  if ((await fileExists(destinationPath)) && options.force !== true) {
    skipped = true;
  } else {
    try {
      await writeFile(
        destinationPath,
        enrichDraftsMarkdownForObsidian(sourceMarkdown),
        {
          encoding: "utf8",
          flag: options.force === true ? "w" : "wx",
        },
      );
    } catch (err) {
      if (hasErrorCode(err, "EEXIST") && options.force !== true) {
        skipped = true;
      } else {
        throw err;
      }
    }
  }

  const writtenIndexPath = await writeObsidianIndex(vaultPath);
  return {
    date,
    sourcePath,
    destinationPath,
    indexPath: writtenIndexPath,
    skipped,
  };
}
