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
  PDF_MAX_BYTES,
  normalizeUrl,
  truncateExcerpt,
} from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";

function normalizePdfText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:$|[?#])/i.test(url);
  }
}

function assertPdfResponse(url: string, res: Response): void {
  const contentLength = res.headers.get("content-length");
  const bytes = contentLength ? Number.parseInt(contentLength, 10) : undefined;
  if (bytes !== undefined && Number.isFinite(bytes) && bytes > PDF_MAX_BYTES) {
    throw new Error(`PDF too large: content-length ${bytes} exceeds ${PDF_MAX_BYTES} bytes`);
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType && isPdfUrl(url)) return;
  if (contentType.includes("application/pdf")) return;
  if (contentType.includes("application/octet-stream")) return;

  throw new Error(`Unexpected PDF content-type: ${contentType || "missing"}`);
}

function assertPdfBufferSize(buffer: ArrayBuffer): void {
  if (buffer.byteLength > PDF_MAX_BYTES) {
    throw new Error(
      `PDF too large: downloaded ${buffer.byteLength} exceeds ${PDF_MAX_BYTES} bytes`,
    );
  }
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
  assertPdfResponse(url, res);
  const buffer = await res.arrayBuffer();
  assertPdfBufferSize(buffer);
  return buffer;
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
