import type { DetectedChange, WatchTargetConfig } from "@seitai-legal-watch/core";
import {
  createDetectedChange,
  resolveChangeType,
  snapshotToTargetState,
} from "@seitai-legal-watch/core";
import type { StateStore } from "@seitai-legal-watch/storage";
import { fetchApiSnapshots } from "./apiFetcher.js";
import { fetchHtmlSnapshot } from "./htmlFetcher.js";
import { fetchRssSnapshots } from "./rssFetcher.js";

export async function fetchSnapshotsForSource(
  source: WatchTargetConfig,
  fetchedAt: string,
) {
  switch (source.type) {
    case "rss":
      return fetchRssSnapshots(source, fetchedAt);
    case "html":
      return [await fetchHtmlSnapshot(source, fetchedAt)];
    case "api":
      return fetchApiSnapshots(source, fetchedAt);
    default:
      return [];
  }
}

export async function runFetchCycle(
  sources: WatchTargetConfig[],
  store: StateStore,
  fetchedAt: string,
): Promise<DetectedChange[]> {
  const changes: DetectedChange[] = [];

  for (const source of sources) {
    try {
      const snapshots = await fetchSnapshotsForSource(source, fetchedAt);

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

        await store.saveRawSnapshot({
          changeId: change.id,
          url: change.url,
          title: change.title,
          detectedAt: change.detectedAt,
          changeType: change.changeType,
          bodyExcerpt: change.bodyExcerpt,
          diffText: change.diffText,
        });

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
      const failedSnapshot = {
        sourceId: source.id,
        sourceName: source.name,
        targetKey: `source:${source.id}`,
        url: source.url,
        title: `${source.name}（取得失敗）`,
        bodyText: message,
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
