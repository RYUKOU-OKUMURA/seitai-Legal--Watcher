import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import matter from "gray-matter";
import { dailyReportPath, resolveRepoRoot } from "./paths.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface ObsidianSyncOptions {
  date?: string;
  force?: boolean;
  root?: string;
  vaultPath?: string;
}

export interface ObsidianSyncResult {
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
    return date;
  }
  const tz = process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  return dayjs().tz(tz).format("YYYY-MM-DD");
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

function legalWatchRoot(vaultPath: string): string {
  return path.join(vaultPath, "Legal Watch");
}

function dailyDirPath(vaultPath: string): string {
  return path.join(legalWatchRoot(vaultPath), "daily");
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

function countCell(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

function generateObsidianIndexMarkdown(entries: DailyIndexEntry[]): string {
  const lines = [
    "# Legal Watch",
    "",
    "> このファイルは `legal-watch sync-obsidian` により自動生成されます。手動編集は次回同期時に上書きされます。",
    "",
    "## 最近の日次レポート",
    "",
  ];

  if (entries.length === 0) {
    lines.push("同期済みの日次レポートはありません。", "");
    return lines.join("\n");
  }

  lines.push(
    "| レポート | 内容更新 | 分析済み | 参考・未分析 | 取得失敗 |",
    "|---|---:|---:|---:|---:|",
  );
  for (const entry of entries) {
    lines.push(
      `| [[daily/${entry.fileName.replace(/\.md$/, "")}|${entry.date}]] | ${countCell(entry.contentUpdateCount)} | ${countCell(entry.analyzedCount)} | ${countCell(entry.gatedOutCount)} | ${countCell(entry.fetchFailureCount)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function writeObsidianIndex(vaultPath: string): Promise<string> {
  const dailyDir = dailyDirPath(vaultPath);
  const destinationPath = indexPath(vaultPath);
  const entries = await loadDailyIndexEntries(dailyDir);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, generateObsidianIndexMarkdown(entries), "utf8");
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

  const writtenIndexPath = await writeObsidianIndex(vaultPath);
  return {
    date,
    sourcePath,
    destinationPath,
    indexPath: writtenIndexPath,
    skipped,
  };
}
