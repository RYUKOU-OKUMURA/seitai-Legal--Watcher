import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Analysis, RawSnapshot } from "@seitai-legal-watch/core";
import {
  generateManualImpactMarkdown,
  type ManualImpactReportEntry,
} from "@seitai-legal-watch/reports";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
  loadLatestAnalysesByChangeId,
  loadRawSnapshots,
} from "./analysisLogs.js";
import { manualImpactReportPath, resolveRepoRoot } from "./paths.js";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const MANUAL_AREA_RULES: { area: string; keywords: string[] }[] = [
  {
    area: "院内資料・マニュアル",
    keywords: [
      "院内資料",
      "院内マニュアル",
      "マニュアル",
      "手順",
      "運用",
      "フロー",
      "院内掲示",
      "配布資料",
      "院内",
    ],
  },
  {
    area: "スタッフ説明",
    keywords: ["スタッフ", "職員", "研修", "説明文", "共有", "スタッフ説明"],
  },
  {
    area: "受付対応",
    keywords: ["受付", "窓口", "患者説明", "患者"],
  },
  {
    area: "問診票",
    keywords: ["問診", "問診票"],
  },
  {
    area: "同意書・リスク説明",
    keywords: ["同意書", "同意", "説明同意", "リスク説明", "禁忌", "注意事項"],
  },
  {
    area: "料金表・返金解約",
    keywords: ["料金表", "料金", "費用", "返金", "解約", "キャンセル", "割引"],
  },
  {
    area: "療養費請求フロー",
    keywords: ["療養費", "受領委任", "保険請求", "請求", "支給申請", "柔道整復"],
  },
  {
    area: "施術メニュー",
    keywords: ["施術メニュー", "メニュー表記", "メニュー"],
  },
  {
    area: "個人情報・記録管理",
    keywords: ["個人情報", "記録管理"],
  },
];

const WEAK_MANUAL_KEYWORDS = [
  "説明",
  "案内",
  "確認",
  "表示",
  "見直し",
  "変更",
  "更新",
];

const CONTEXTUAL_MANUAL_KEYWORDS = [
  "院内",
  "受付",
  "スタッフ",
  "職員",
  "患者",
  "料金",
  "費用",
  "同意",
  "問診",
  "療養費",
  "請求",
  "施術",
  "返金",
  "解約",
  "個人情報",
];

const CONTEXTUAL_MANUAL_AREA_RULES: { area: string; keywords: string[] }[] = [
  { area: "院内資料・マニュアル", keywords: ["院内"] },
  { area: "スタッフ説明", keywords: ["スタッフ", "職員"] },
  { area: "受付対応", keywords: ["受付", "患者"] },
  { area: "問診票", keywords: ["問診"] },
  { area: "同意書・リスク説明", keywords: ["同意"] },
  { area: "料金表・返金解約", keywords: ["料金", "費用", "返金", "解約"] },
  { area: "療養費請求フロー", keywords: ["療養費", "請求"] },
  { area: "施術メニュー", keywords: ["施術"] },
  { area: "個人情報・記録管理", keywords: ["個人情報"] },
];

export interface ManualImpactEntriesFromLogs {
  date: string;
  entries: ManualImpactReportEntry[];
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

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function manualAreasFromText(text: string): string[] {
  const strongAreas = MANUAL_AREA_RULES
    .filter((rule) => includesAny(text, rule.keywords))
    .map((rule) => rule.area);
  if (strongAreas.length > 0) return uniqueNonEmpty(strongAreas);

  if (
    includesAny(text, WEAK_MANUAL_KEYWORDS) &&
    includesAny(text, CONTEXTUAL_MANUAL_KEYWORDS)
  ) {
    return CONTEXTUAL_MANUAL_AREA_RULES
      .filter((rule) => includesAny(text, rule.keywords))
      .map((rule) => rule.area);
  }

  return [];
}

function manualFields(analysis: Analysis): { reason: string; text: string }[] {
  return [
    { reason: "category", text: analysis.category },
    { reason: "summary", text: analysis.summary },
    { reason: "whatChanged", text: analysis.whatChanged },
    { reason: "impact", text: analysis.impact },
    {
      reason: "operator_checkpoints",
      text: analysis.operator_checkpoints.join("\n"),
    },
  ];
}

function selectionMetadata(analysis: Analysis): {
  selectionReasons: string[];
  manualReviewAreas: string[];
} {
  const selectionReasons: string[] = [];
  const manualReviewAreas: string[] = [];

  for (const field of manualFields(analysis)) {
    const areas = manualAreasFromText(field.text);
    if (areas.length === 0) continue;
    selectionReasons.push(field.reason);
    manualReviewAreas.push(...areas);
  }

  return {
    selectionReasons: uniqueNonEmpty(selectionReasons),
    manualReviewAreas: uniqueNonEmpty(manualReviewAreas),
  };
}

export function isManualImpactTarget(analysis: Analysis): boolean {
  return selectionMetadata(analysis).selectionReasons.length > 0;
}

export async function collectManualImpactEntriesFromLogs(
  dateInput: string,
  options: {
    root?: string;
    timezone?: string;
  } = {},
): Promise<ManualImpactEntriesFromLogs> {
  const date = validateDate(dateInput);
  const root = options.root ?? resolveRepoRoot();
  const timezoneName = options.timezone ?? process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const rawSnapshots = await loadRawSnapshots(root);
  const rawByChangeId = new Map(rawSnapshots.map((raw) => [raw.changeId, raw]));
  const analyses = await loadLatestAnalysesByChangeId(root);
  const entries: ManualImpactReportEntry[] = [];

  for (const [changeId, analysis] of analyses.entries()) {
    const raw = rawByChangeId.get(changeId);
    if (!raw || !isRawOnDate(raw, date, timezoneName)) continue;
    const metadata = selectionMetadata(analysis);
    if (metadata.selectionReasons.length === 0) continue;
    entries.push({
      analysis,
      change: rawSnapshotToDetectedChange(raw),
      detectedDate: dayjs(raw.detectedAt).tz(timezoneName).format("YYYY-MM-DD HH:mm"),
      selectionReasons: metadata.selectionReasons,
      manualReviewAreas: metadata.manualReviewAreas,
    });
  }

  return { date, entries };
}

export async function regenerateManualImpactFromLogs(date: string): Promise<string> {
  const root = resolveRepoRoot();
  const result = await collectManualImpactEntriesFromLogs(date, { root });
  const markdown = generateManualImpactMarkdown(result);
  const reportPath = manualImpactReportPath(root, result.date);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}
