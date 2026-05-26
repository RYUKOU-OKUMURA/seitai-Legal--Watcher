import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
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
  skipped: boolean;
}

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

export async function syncDailyReportToObsidian(
  options: ObsidianSyncOptions = {},
): Promise<ObsidianSyncResult> {
  const date = resolveReportDate(options.date);
  const root = options.root ?? resolveRepoRoot();
  const vaultPath = resolveVaultPath(options.vaultPath);
  const sourcePath = dailyReportPath(root, date);
  const destinationPath = path.join(
    vaultPath,
    "Legal Watch",
    "daily",
    `${date}.md`,
  );

  await mkdir(path.dirname(destinationPath), { recursive: true });

  try {
    await copyFile(
      sourcePath,
      destinationPath,
      options.force === true ? 0 : constants.COPYFILE_EXCL,
    );
    return { date, sourcePath, destinationPath, skipped: false };
  } catch (err) {
    if (hasErrorCode(err, "EEXIST") && options.force !== true) {
      return { date, sourcePath, destinationPath, skipped: true };
    }
    if (hasErrorCode(err, "ENOENT")) {
      throw new Error(
        `Daily report not found: ${sourcePath}. Run pnpm daily or pnpm report for ${date} before syncing Obsidian.`,
      );
    }
    throw err;
  }
}
