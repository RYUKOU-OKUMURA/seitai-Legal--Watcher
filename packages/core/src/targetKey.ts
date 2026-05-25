import { normalizeUrl } from "./normalizeUrl.js";

export function buildTargetKey(
  type: "rss" | "html" | "api",
  url: string,
  stableId?: string,
): string {
  if (type === "api" && stableId) {
    return `api:${stableId}`;
  }
  return normalizeUrl(url);
}
