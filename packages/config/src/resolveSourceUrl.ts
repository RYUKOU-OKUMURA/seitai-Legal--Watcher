import type { WatchTargetConfig } from "@seitai-legal-watch/core";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export function resolveSourceUrl(
  source: WatchTargetConfig,
  referenceDate?: string,
): string {
  const tz = process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const d = referenceDate
    ? dayjs.tz(referenceDate, tz)
    : dayjs().tz(tz);

  const yyyy = d.format("YYYY");
  const mm = d.format("MM");
  const yyyymm = d.format("YYYYMM");

  const expanded = source.url
    .replace(/\{YYYYMM\}/g, yyyymm)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{MM\}/g, mm);

  return expanded;
}

export function resolvedSource(
  source: WatchTargetConfig,
  referenceDate?: string,
): WatchTargetConfig {
  return { ...source, url: resolveSourceUrl(source, referenceDate) };
}
