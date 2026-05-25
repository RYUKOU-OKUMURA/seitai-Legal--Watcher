import * as cheerio from "cheerio";
import type { FetchSnapshot, WatchTargetConfig } from "@seitai-legal-watch/core";
import { buildTargetKey, hashFromSnapshot, normalizeUrl } from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";

function extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      links.add(normalizeUrl(new URL(href, baseUrl).toString()));
    } catch {
      /* skip invalid */
    }
  });
  return [...links].sort();
}

function decodeHtmlBody(res: Response, buffer: ArrayBuffer): string {
  const ctype = res.headers.get("content-type") ?? "";
  const charsetMatch = ctype.match(/charset=([\w-]+)/i);
  const charset = charsetMatch?.[1]?.toLowerCase().replace(/_/g, "-") ?? "utf-8";
  const label =
    charset === "shift-jis" || charset === "sjis" || charset === "windows-31j"
      ? "shift-jis"
      : charset === "euc-jp"
        ? "euc-jp"
        : "utf-8";
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export async function fetchHtmlSnapshot(
  source: WatchTargetConfig,
  fetchedAt: string,
): Promise<FetchSnapshot> {
  const res = await fetchWithRetry(source.url);
  const buffer = await res.arrayBuffer();
  const html = decodeHtmlBody(res, buffer);
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  const title = $("title").first().text().trim() || source.name;
  const bodyText = $("main, article, #contents, .contents, body")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50_000);
  const url = normalizeUrl(source.url);
  const links = extractLinks($, source.url);
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    targetKey: buildTargetKey("html", url),
    url,
    title,
    bodyText: bodyText || title,
    links,
    fetchedAt,
    httpStatus: res.status,
  };
  return { ...base, contentHash: hashFromSnapshot(base) };
}
