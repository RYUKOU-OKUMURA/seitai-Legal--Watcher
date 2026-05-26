import * as cheerio from "cheerio";
import type { FetchSnapshot, WatchTargetConfig } from "@seitai-legal-watch/core";
import { buildTargetKey, hashFromSnapshot, normalizeUrl } from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";
import { fetchPdfExcerpts } from "./pdfFetcher.js";

function extractLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  scopeSelector?: string,
): string[] {
  const links = new Set<string>();
  const scope = scopeSelector ? $(scopeSelector) : $("body");
  scope.find("a[href]").each((_, el) => {
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

function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:$|[?#])/i.test(url);
  }
}

export function extractPdfLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  scopeSelector?: string,
  maxLinks = 10,
): string[] {
  const links = new Set<string>();
  const scope = scopeSelector ? $(scopeSelector) : $("body");
  scope.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const url = normalizeUrl(new URL(href, baseUrl).toString());
      if (isPdfUrl(url)) links.add(url);
    } catch {
      /* skip invalid */
    }
  });
  return [...links].sort().slice(0, maxLinks);
}

function parseCharsetFromMeta(htmlHead: string): string | undefined {
  const httpEquiv = htmlHead.match(
    /charset\s*=\s*["']?([\w-]+)/i,
  );
  if (httpEquiv?.[1]) return httpEquiv[1].toLowerCase();

  const metaCharset = htmlHead.match(
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i,
  );
  if (metaCharset?.[1]) return metaCharset[1].toLowerCase();

  return undefined;
}

function decoderLabel(charset: string | undefined): string {
  if (!charset) return "utf-8";
  const c = charset.toLowerCase().replace(/_/g, "-");
  if (c === "shift-jis" || c === "sjis" || c === "windows-31j") return "shift-jis";
  if (c === "euc-jp") return "euc-jp";
  return "utf-8";
}

function decodeHtmlBody(res: Response, buffer: ArrayBuffer): string {
  const ctype = res.headers.get("content-type") ?? "";
  const headerMatch = ctype.match(/charset=([\w-]+)/i);
  let charset = headerMatch?.[1]?.toLowerCase();

  if (!charset) {
    const headBytes = new Uint8Array(buffer.slice(0, 8192));
    const headUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(headBytes);
    charset = parseCharsetFromMeta(headUtf8);
  }

  const label = decoderLabel(charset);
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function extractBodyText(
  $: cheerio.CheerioAPI,
  contentSelector?: string,
): string {
  if (contentSelector) {
    const parts = contentSelector.split(",").map((s) => s.trim());
    const chunks: string[] = [];
    for (const sel of parts) {
      $(sel).each((_, el) => {
        chunks.push($(el).text());
      });
    }
    if (chunks.length > 0) {
      return chunks.join("\n").replace(/\s+/g, " ").trim();
    }
  }
  return $("main, article, #contents, .contents, #main, .main, body")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50_000);
}

export async function fetchHtmlSnapshot(
  source: WatchTargetConfig,
  fetchedAt: string,
): Promise<FetchSnapshot> {
  const res = await fetchWithRetry(source.url);
  const buffer = await res.arrayBuffer();
  const html = decodeHtmlBody(res, buffer);
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header").remove();

  const linkScope = source.contentSelector
    ? source.contentSelector.split(",")[0]!.trim()
    : undefined;
  const pdfScope = source.pdfLinkSelector;

  const title = $("title").first().text().trim() || source.name;
  const bodyText = extractBodyText($, source.contentSelector);
  const url = normalizeUrl(source.url);
  const links = extractLinks($, source.url, linkScope);
  const pdfLinks = source.followPdfLinks
    ? extractPdfLinks($, source.url, pdfScope, source.pdfMaxLinks ?? 10)
    : [];
  const pdfs = source.followPdfLinks
    ? await fetchPdfExcerpts(pdfLinks)
    : { excerpts: [], errors: [] };

  const base = {
    sourceId: source.id,
    sourceName: source.name,
    targetKey: buildTargetKey("html", url),
    url,
    title,
    bodyText: bodyText || title,
    links,
    pdfExcerpts: pdfs.excerpts,
    pdfErrors: pdfs.errors,
    fetchedAt,
    httpStatus: res.status,
  };
  return { ...base, contentHash: hashFromSnapshot(base) };
}
