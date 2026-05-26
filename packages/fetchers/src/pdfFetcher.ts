import { PDFParse } from "pdf-parse";
import type {
  FetchSnapshot,
  PdfError,
  PdfExcerpt,
  WatchTargetConfig,
} from "@seitai-legal-watch/core";
import {
  buildTargetKey,
  contentHash,
  EXCERPT_MAX_CHARS,
  hashFromSnapshot,
  normalizeUrl,
  truncateExcerpt,
} from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";

function normalizePdfText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    useSystemFonts: true,
  });
  try {
    const result = await parser.getText();
    return normalizePdfText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function fetchPdfBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/pdf, */*" },
  });
  if (res.status < 200 || res.status >= 400) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function fetchPdfExcerpt(
  url: string,
  title?: string,
): Promise<PdfExcerpt> {
  const normalizedUrl = normalizeUrl(url);
  const buffer = await fetchPdfBuffer(normalizedUrl);
  const text = await extractPdfText(buffer);
  const textExcerpt = truncateExcerpt(text || title || normalizedUrl, EXCERPT_MAX_CHARS);
  return {
    url: normalizedUrl,
    title,
    textExcerpt,
    contentHash: contentHash(text),
  };
}

export async function fetchPdfExcerpts(
  urls: string[],
): Promise<{ excerpts: PdfExcerpt[]; errors: PdfError[] }> {
  const excerpts: PdfExcerpt[] = [];
  const errors: PdfError[] = [];

  for (const url of urls) {
    try {
      excerpts.push(await fetchPdfExcerpt(url));
    } catch (err) {
      errors.push({
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { excerpts, errors };
}

export async function fetchPdfSnapshot(
  source: WatchTargetConfig,
  fetchedAt: string,
): Promise<FetchSnapshot> {
  const url = normalizeUrl(source.url);
  const excerpt = await fetchPdfExcerpt(url, source.name);
  const base = {
    sourceId: source.id,
    sourceName: source.name,
    targetKey: buildTargetKey("pdf", url),
    url,
    title: source.name,
    bodyText: excerpt.textExcerpt,
    links: [] as string[],
    pdfExcerpts: [excerpt],
    fetchedAt,
    httpStatus: 200,
  };
  return { ...base, contentHash: hashFromSnapshot(base) };
}
