import { normalizeUrl } from "./normalizeUrl.js";

export function buildTargetKey(
  type: "rss" | "html" | "api" | "pdf",
  url: string,
  stableId?: string,
  sourceId?: string,
): string {
  if (type === "api" && stableId) {
    return sourceId ? `api:${sourceId}:${stableId}` : `api:${stableId}`;
  }
  // deepLinkFetcher が RSS エントリを判別できるようプレフィックスを付ける
  if (type === "rss") {
    return `rss:${normalizeUrl(url)}`;
  }
  return normalizeUrl(url);
}
