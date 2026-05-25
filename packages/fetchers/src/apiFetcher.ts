import type { FetchSnapshot, WatchTargetConfig } from "@seitai-legal-watch/core";
import { buildTargetKey, hashFromSnapshot } from "@seitai-legal-watch/core";
import { fetchWithRetry } from "./http.js";

function getByPath(obj: unknown, pathStr: string): unknown {
  return pathStr.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function collectItems(data: unknown, itemsPath?: string): unknown[] {
  if (itemsPath) {
    const items = getByPath(data, itemsPath);
    if (Array.isArray(items)) return items;
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const val of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(val)) return val;
    }
  }
  return [data];
}

function resolveStableId(
  record: unknown,
  stableIdField: string | undefined,
  fallbackIndex: number,
): string {
  if (stableIdField) {
    const id = getByPath(record, stableIdField);
    if (id !== undefined && id !== null) return String(id);
  }
  if (record && typeof record === "object") {
    const r = record as Record<string, unknown>;
    if (r.id) return String(r.id);
    if (r.law_id) return String(r.law_id);
  }
  return `index:${fallbackIndex}`;
}

export async function fetchApiSnapshots(
  source: WatchTargetConfig,
  fetchedAt: string,
): Promise<FetchSnapshot[]> {
  const res = await fetchWithRetry(source.url);
  const data = (await res.json()) as unknown;
  const items = collectItems(data, source.itemsPath);

  return items.map((record, index) => {
    const stableId = resolveStableId(record, source.stableIdField, index);
    const bodyText = JSON.stringify(record);
    const title =
      typeof record === "object" && record !== null
        ? String(
            (record as Record<string, unknown>).law_title ??
              (record as Record<string, unknown>).title ??
              (record as Record<string, unknown>).name ??
              stableId,
          )
        : stableId;
    const targetKey = buildTargetKey("api", source.url, stableId);
    const base = {
      sourceId: source.id,
      sourceName: source.name,
      targetKey,
      url: `${source.url}#${stableId}`,
      title,
      bodyText,
      links: [] as string[],
      fetchedAt,
      httpStatus: res.status,
    };
    return { ...base, contentHash: hashFromSnapshot(base) };
  });
}
