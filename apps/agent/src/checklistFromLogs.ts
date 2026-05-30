import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import {
  generateAdChecklistMarkdown,
  type AdChecklistReportEntry,
} from "@seitai-legal-watch/reports";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
  loadLatestAnalysesByChangeId,
  loadRawSnapshots,
} from "./analysisLogs.js";
import { checklistReportPath, resolveRepoRoot } from "./paths.js";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const AD_CATEGORY_KEYWORDS = [
  "広告",
  "表示",
  "消費者庁",
  "景品表示",
  "景表法",
  "医療広告",
  "健康被害",
  "口コミ",
  "料金表示",
  "特定商取引",
  "誇大",
  "優良誤認",
  "有利誤認",
];

const AD_IMPACT_KEYWORDS = [
  "LP",
  "ランディングページ",
  "広告",
  "SNS",
  "口コミ",
  "No.1",
  "ナンバーワン",
  "ビフォーアフター",
  "治る",
  "必ず改善",
  "改善保証",
  "効果保証",
  "割引",
  "期間限定",
  "表示",
  "広告表示",
  "景品表示",
  "医療広告",
  "体験談",
  "比較",
  "キャンペーン",
];

const AD_TEXT_KEYWORDS = AD_IMPACT_KEYWORDS.filter((keyword) => keyword !== "表示");

const ACTIONABLE_LOW_AD_IMPACT_PATTERNS = [
  "ただし",
  "一方",
  "なお",
  "要確認",
  "確認が必要",
  "確認する必要",
  "見直し",
  "修正",
  "注意",
];

const LOW_AD_IMPACT_PATTERNS = [
  "該当なし",
  "影響なし",
  "特になし",
  "直接改正ではない",
  "直接的な変更示唆",
  "直接的な変更は",
  "直接的な影響はありません",
  "直接的な影響はない",
  "広告・LP・SNSへの影響はありません",
  "広告・LP・SNSへの影響はない",
];

export interface ChecklistEntriesFromLogs {
  date: string;
  entries: AdChecklistReportEntry[];
}

function validateDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }
  return date;
}

function isRawOnDate(raw: RawSnapshot, date: string, timezoneName: string): boolean {
  const detected = dayjs(raw.detectedAt);
  if (!detected.isValid()) return false;
  return detected.tz(timezoneName).format("YYYY-MM-DD") === date;
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasSpecificAdImpact(adImpact: string): boolean {
  const text = adImpact.trim();
  if (!text) return false;
  if (LOW_AD_IMPACT_PATTERNS.some((pattern) => text.includes(pattern))) {
    return (
      includesAny(text, ACTIONABLE_LOW_AD_IMPACT_PATTERNS) &&
      includesAny(text, AD_IMPACT_KEYWORDS)
    );
  }
  return includesAny(text, AD_IMPACT_KEYWORDS);
}

function selectionReasons(analysis: Analysis): string[] {
  const reasons: string[] = [];
  if (hasSpecificAdImpact(analysis.adImpact)) {
    reasons.push("adImpact");
  }
  if (includesAny(analysis.category, AD_CATEGORY_KEYWORDS)) {
    reasons.push("category");
  }

  const analysisText = [
    analysis.summary,
    analysis.impact,
    ...analysis.operator_checkpoints,
  ].join("\n");
  if (includesAny(analysisText, AD_TEXT_KEYWORDS)) {
    reasons.push("確認ポイント・要約");
  }

  return reasons;
}

export function isAdChecklistTarget(analysis: Analysis): boolean {
  return selectionReasons(analysis).length > 0;
}

export async function collectChecklistEntriesFromLogs(
  dateInput: string,
  options: {
    root?: string;
    timezone?: string;
  } = {},
): Promise<ChecklistEntriesFromLogs> {
  const date = validateDate(dateInput);
  const root = options.root ?? resolveRepoRoot();
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const rawSnapshots = await loadRawSnapshots(root);
  const rawByChangeId = new Map(rawSnapshots.map((raw) => [raw.changeId, raw]));
  const analyses = await loadLatestAnalysesByChangeId(root);
  const entries: AdChecklistReportEntry[] = [];

  for (const [changeId, analysis] of analyses.entries()) {
    const raw = rawByChangeId.get(changeId);
    if (!raw || !isRawOnDate(raw, date, timezoneName)) continue;
    const reasons = selectionReasons(analysis);
    if (reasons.length === 0) continue;
    entries.push({
      analysis,
      change: rawSnapshotToDetectedChange(raw),
      detectedDate: dayjs(raw.detectedAt).tz(timezoneName).format("YYYY-MM-DD HH:mm"),
      selectionReasons: reasons,
    });
  }

  return { date, entries };
}

export async function regenerateAdChecklistFromLogs(date: string): Promise<string> {
  const root = resolveRepoRoot();
  const result = await collectChecklistEntriesFromLogs(date, { root });
  const markdown = generateAdChecklistMarkdown(result);
  const reportPath = checklistReportPath(root, result.date);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}
