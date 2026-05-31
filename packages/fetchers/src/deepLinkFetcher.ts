import * as cheerio from "cheerio";
import type {
  DetectedChange,
  LinkedError,
  LinkedExcerpt,
  PdfError,
  PdfExcerpt,
} from "@seitai-legal-watch/core";
import {
  EXCERPT_MAX_CHARS,
  normalizeUrl,
  truncateExcerpt,
} from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";
import { fetchPdfExcerpt } from "./pdfFetcher.js";

export interface DeepFetchResult {
  linkedExcerpts: LinkedExcerpt[];
  linkedErrors: LinkedError[];
  pdfExcerpts: PdfExcerpt[];
  pdfErrors: PdfError[];
}

export interface DeepFetchOptions {
  maxHtmlLinks?: number;
  maxPdfLinks?: number;
}

function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:$|[?#])/i.test(url);
  }
}

function sameOrigin(candidate: string, base: string): boolean {
  try {
    return new URL(candidate).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function candidateLinks(
  change: DetectedChange,
  kind: "html" | "pdf",
  limit: number,
  extraLinks: string[] = [],
): string[] {
  const sourceUrl = normalizeUrl(change.url);
  const seen = new Set<string>();
  const urls: string[] = [];
  const links =
    change.targetKey.startsWith("rss:") && !extraLinks.includes(sourceUrl)
      ? [sourceUrl, ...change.links, ...extraLinks]
      : [...change.links, ...extraLinks];
  for (const link of links) {
    let normalized: string;
    try {
      normalized = normalizeUrl(link);
    } catch {
      continue;
    }
    if (normalized === sourceUrl && !change.targetKey.startsWith("rss:")) continue;
    if (!sameOrigin(normalized, sourceUrl)) continue;
    if (kind === "pdf" && !isPdfUrl(normalized)) continue;
    if (kind === "html" && isPdfUrl(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= limit) break;
  }
  return urls;
}

async function fetchLinkedHtmlExcerpt(
  url: string,
): Promise<{ excerpt: LinkedExcerpt; pdfLinks: string[] }> {
  const res = await fetchWithRetry(url, {
    headers: { Accept: "text/html, application/xhtml+xml, */*" },
  });
  if (res.status < 200 || res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
    throw new Error(`Unexpected linked content-type: ${contentType}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header").remove();
  const title = $("title").first().text().replace(/\s+/g, " ").trim() || undefined;
  const text = $("main, article, #contents, .contents, #main, .main, body")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const pdfLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const linked = normalizeUrl(new URL(href, url).toString());
      if (sameOrigin(linked, url) && isPdfUrl(linked)) pdfLinks.add(linked);
    } catch {
      /* skip invalid links */
    }
  });
  return {
    excerpt: {
      url,
      title,
      textExcerpt: truncateExcerpt(text || title || url, EXCERPT_MAX_CHARS),
    },
    pdfLinks: [...pdfLinks],
  };
}

export async function fetchDeepLinkExcerpts(
  change: DetectedChange,
  options: DeepFetchOptions = {},
): Promise<DeepFetchResult> {
  const maxHtmlLinks = options.maxHtmlLinks ?? 3;
  const maxPdfLinks = options.maxPdfLinks ?? 3;
  const linkedExcerpts: LinkedExcerpt[] = [];
  const linkedErrors: LinkedError[] = [];
  const pdfExcerpts: PdfExcerpt[] = [];
  const pdfErrors: PdfError[] = [];

  const discoveredPdfLinks: string[] = [];
  for (const url of candidateLinks(change, "html", maxHtmlLinks)) {
    try {
      const result = await fetchLinkedHtmlExcerpt(url);
      linkedExcerpts.push(result.excerpt);
      discoveredPdfLinks.push(...result.pdfLinks);
    } catch (err) {
      linkedErrors.push({ url, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const url of candidateLinks(change, "pdf", maxPdfLinks, discoveredPdfLinks)) {
    try {
      pdfExcerpts.push(await fetchPdfExcerpt(url));
    } catch (err) {
      pdfErrors.push({ url, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { linkedExcerpts, linkedErrors, pdfExcerpts, pdfErrors };
}
