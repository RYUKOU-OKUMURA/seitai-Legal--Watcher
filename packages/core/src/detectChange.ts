import { createTwoFilesPatch } from "diff";
import { randomUUID } from "node:crypto";
import type { ChangeType, FetchSnapshot, TargetState } from "./types.js";
import type { DetectedChange } from "./types.js";
import { truncateExcerpt, contentHash, buildSnapshotPayload } from "./hash.js";
import { EXCERPT_MAX_CHARS } from "./constants.js";

export function resolveChangeType(
  prev: TargetState | undefined,
  current: FetchSnapshot,
): ChangeType | null {
  if (current.httpStatus < 200 || current.httpStatus >= 400) {
    return "failed";
  }
  if (!prev) return "new";
  if (prev.contentHash === current.contentHash) return null;
  return "updated";
}

export function buildDiffText(
  prev: TargetState | undefined,
  current: FetchSnapshot,
): string | undefined {
  if (!prev?.bodyExcerpt) return undefined;
  const oldText = `${prev.title ?? ""}\n${prev.bodyExcerpt}\n${(prev.links ?? []).join("\n")}`;
  const newText = `${current.title}\n${current.bodyText}\n${current.links.join("\n")}`;
  if (oldText === newText) return undefined;
  return createTwoFilesPatch("previous", "current", oldText, newText) ?? undefined;
}

export function createDetectedChange(
  snapshot: FetchSnapshot,
  sourceWeight: import("./types.js").SourceWeight,
  prev: TargetState | undefined,
  changeType: ChangeType,
): DetectedChange {
  const diffText = changeType === "failed" ? undefined : buildDiffText(prev, snapshot);
  return {
    id: randomUUID(),
    sourceId: snapshot.sourceId,
    sourceName: snapshot.sourceName,
    sourceWeight,
    targetKey: snapshot.targetKey,
    url: snapshot.url,
    title: snapshot.title,
    publishedAt: snapshot.publishedAt,
    detectedAt: snapshot.fetchedAt,
    changeType,
    diffText,
    bodyExcerpt: truncateExcerpt(snapshot.bodyText, EXCERPT_MAX_CHARS),
    links: snapshot.links,
    httpStatus: snapshot.httpStatus,
  };
}

export function snapshotToTargetState(snapshot: FetchSnapshot): TargetState {
  return {
    contentHash: snapshot.contentHash,
    title: snapshot.title,
    lastFetchedAt: snapshot.fetchedAt,
    lastHttpStatus: snapshot.httpStatus,
    bodyExcerpt: truncateExcerpt(snapshot.bodyText, EXCERPT_MAX_CHARS),
    links: snapshot.links,
  };
}

export function hashFromSnapshot(snapshot: Omit<FetchSnapshot, "contentHash">): string {
  return contentHash(
    buildSnapshotPayload(snapshot.title, snapshot.bodyText, snapshot.links),
  );
}
