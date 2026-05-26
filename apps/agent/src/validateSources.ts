import { loadConfig, resolveSourceUrl } from "@seitai-legal-watch/config";
import { REQUEST_TIMEOUT_MS } from "@seitai-legal-watch/core";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface SourceValidationResult {
  id: string;
  url: string;
  ok: boolean;
  status?: number;
  bodyLength?: number;
  error?: string;
}

export interface SourceValidationOptions {
  referenceDate?: string;
  includeDisabled?: boolean;
}

export async function validateSources(
  options: SourceValidationOptions = {},
): Promise<SourceValidationResult[]> {
  const config = await loadConfig();
  const tz = process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const date =
    options.referenceDate ?? dayjs().tz(tz).format("YYYY-MM-DD");
  const sources = options.includeDisabled ? config.sources : config.enabledSources;

  const results: SourceValidationResult[] = [];

  for (const source of sources) {
    const url = resolveSourceUrl(source, date);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SeitaiLegalWatch/0.1; +https://github.com)",
          Accept: "application/json, application/xml, text/xml, text/html, application/pdf, */*",
          "Accept-Language": "ja,en;q=0.9",
          "Accept-Encoding": "identity",
        },
      });
      const text = await res.text();
      const minBodyLength = source.type === "api" ? 50 : 500;
      const hasBody = text.length > minBodyLength;
      // Some official sites return 403 to datacenter IPs while still serving HTML (WAF).
      const ok =
        hasBody &&
        (res.status >= 200 && res.status < 400
          ? true
          : res.status === 403 && text.length >= 5000);
      results.push({
        id: source.id,
        url,
        ok,
        status: res.status,
        bodyLength: text.length,
        error: ok
          ? res.status === 403
            ? "degraded_403"
            : undefined
          : `status=${res.status} bodyLen=${text.length}`,
      });
    } catch (err) {
      results.push({
        id: source.id,
        url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export async function validateEnabledSources(
  referenceDate?: string,
): Promise<SourceValidationResult[]> {
  return validateSources({ referenceDate });
}

export function printValidationResults(results: SourceValidationResult[]): boolean {
  let allOk = true;
  for (const r of results) {
    if (r.ok) {
      const note = r.error === "degraded_403" ? " (403/WAF)" : "";
      console.log(`OK  ${r.id} ${r.status} ${r.bodyLength}b${note} ${r.url}`);
    } else {
      allOk = false;
      console.error(`NG  ${r.id} ${r.error ?? "unknown"} ${r.url}`);
    }
  }
  return allOk;
}
