import type { DetectedChange, WatchTargetConfig } from "@seitai-legal-watch/core";
import {
  createDetectedChange,
  resolveChangeType,
  snapshotToTargetState,
  truncateForReport,
} from "@seitai-legal-watch/core";
import { resolvedSource } from "@seitai-legal-watch/config";
import type { StateStore } from "@seitai-legal-watch/storage";
import { fetchApiSnapshots } from "./apiFetcher.js";
import { fetchHtmlSnapshot } from "./htmlFetcher.js";
import { fetchPdfSnapshot } from "./pdfFetcher.js";
import { fetchRssSnapshots } from "./rssFetcher.js";
import { detectedChangeToRawSnapshot } from "./rawSnapshot.js";

export async function fetchSnapshotsForSource(
  source: WatchTargetConfig,
  fetchedAt: string,
  referenceDate?: string,
) {
  const resolved = resolvedSource(source, referenceDate);
  switch (resolved.type) {
    case "rss":
      return fetchRssSnapshots(resolved, fetchedAt);
    case "html":
      return [await fetchHtmlSnapshot(resolved, fetchedAt)];
    case "api":
      return fetchApiSnapshots(resolved, fetchedAt);
    case "pdf":
      return [await fetchPdfSnapshot(resolved, fetchedAt)];
    default:
      return [];
  }
}

export async function runFetchCycle(
  sources: WatchTargetConfig[],
  store: StateStore,
  fetchedAt: string,
  referenceDate?: string,
): Promise<DetectedChange[]> {
  const changes: DetectedChange[] = [];

  for (const source of sources) {
    try {
      const snapshots = await fetchSnapshotsForSource(
        source,
        fetchedAt,
        referenceDate,
      );

      for (const snapshot of snapshots) {
        const prev = await store.getTargetState(snapshot.targetKey);
        const changeType = resolveChangeType(prev, snapshot);

        await store.appendFetchLog({
          at: fetchedAt,
          sourceId: source.id,
          targetKey: snapshot.targetKey,
          httpStatus: snapshot.httpStatus,
          changeType: changeType ?? "none",
        });

        if (!changeType) {
          await store.upsertTargetState(
            snapshot.targetKey,
            snapshotToTargetState(snapshot),
          );
          continue;
        }

        const change = createDetectedChange(
          snapshot,
          source.weight,
          prev,
          changeType,
        );
        changes.push(change);

        await store.saveRawSnapshot(detectedChangeToRawSnapshot(change));

        if (changeType !== "failed") {
          await store.upsertTargetState(
            snapshot.targetKey,
            snapshotToTargetState(snapshot),
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await store.appendFetchLog({
        at: fetchedAt,
        sourceId: source.id,
        error: message,
      });
      const resolved = resolvedSource(source, referenceDate);
      const failedSnapshot = {
        sourceId: source.id,
        sourceName: source.name,
        targetKey: `source:${source.id}`,
        url: resolved.url,
        title: `${source.name}（取得失敗）`,
        bodyText: truncateForReport(message),
        links: [] as string[],
        contentHash: "",
        fetchedAt,
        httpStatus: 0,
      };
      const change = createDetectedChange(
        failedSnapshot,
        source.weight,
        undefined,
        "failed",
      );
      changes.push(change);
    }
  }

  return changes;
}
