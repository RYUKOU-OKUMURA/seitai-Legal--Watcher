import { XMLParser } from "fast-xml-parser";
import type { FetchSnapshot, WatchTargetConfig } from "@seitai-legal-watch/core";
import {
  buildTargetKey,
  hashFromSnapshot,
  normalizeUrl,
} from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";

interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function extractItems(parsed: unknown): RssItem[] {
  const root = parsed as Record<string, unknown>;

  // RSS 1.0 (RDF): e-Gov パブコメ等。<item> は channel の兄弟要素
  const rdf = root["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rdf) {
    const items = asArray(rdf.item as Record<string, unknown> | Record<string, unknown>[]);
    return items.map((item) => ({
      title: String(item.title ?? ""),
      link: String(item.link ?? ""),
      pubDate: String(item["dc:date"] ?? item.pubDate ?? ""),
      description: String(item.description ?? ""),
    }));
  }

  const rss = (root.rss ?? root.feed) as Record<string, unknown> | undefined;
  if (!rss) return [];

  if (root.feed) {
    const channel = rss;
    const entries = asArray(channel.entry as Record<string, unknown> | Record<string, unknown>[]);
    return entries.map((entry) => {
      const link =
        typeof entry.link === "object" && entry.link !== null
          ? String((entry.link as { "@_href"?: string })["@_href"] ?? entry.link)
          : String(entry.link ?? "");
      return {
        title: String(entry.title ?? ""),
        link,
        pubDate: String(entry.updated ?? entry.published ?? ""),
        description: String(entry.summary ?? entry.content ?? ""),
      };
    });
  }

  const channel = (rss.channel ?? rss) as Record<string, unknown>;
  const items = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);
  return items.map((item) => ({
    title: String(item.title ?? ""),
    link: String(item.link ?? ""),
    pubDate: String(item.pubDate ?? item.published ?? ""),
    description: String(item.description ?? ""),
  }));
}

export async function fetchRssSnapshots(
  source: WatchTargetConfig,
  fetchedAt: string,
): Promise<FetchSnapshot[]> {
  const res = await fetchWithRetry(source.url);
  if (res.status < 200 || res.status >= 400) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(text);
  const items = extractItems(parsed);

  return items
    .filter((item) => item.link)
    .map((item) => {
      const url = normalizeUrl(item.link);
      const bodyText = `${item.description ?? ""}`.replace(/<[^>]+>/g, " ").trim();
      const base = {
        sourceId: source.id,
        sourceName: source.name,
        targetKey: buildTargetKey("rss", url),
        url,
        title: item.title || url,
        publishedAt: item.pubDate || undefined,
        bodyText,
        links: [] as string[],
        fetchedAt,
        httpStatus: res.status,
      };
      return {
        ...base,
        contentHash: hashFromSnapshot(base),
      };
    });
}
