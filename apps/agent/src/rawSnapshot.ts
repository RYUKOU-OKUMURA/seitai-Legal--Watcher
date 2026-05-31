import type { DetectedChange, RawSnapshot } from "@seitai-legal-watch/core";

export function rawSnapshotToDetectedChange(raw: RawSnapshot): DetectedChange {
  return {
    id: raw.changeId,
    sourceId: raw.sourceId ?? "unknown",
    sourceName: raw.sourceName ?? "Unknown source",
    sourceWeight: raw.sourceWeight ?? "medium",
    targetKey: raw.targetKey ?? raw.url,
    url: raw.url,
    title: raw.title,
    detectedAt: raw.detectedAt,
    changeType: raw.changeType,
    diffText: raw.diffText,
    bodyExcerpt: raw.bodyExcerpt,
    links: raw.links ?? [],
    pdfExcerpts: raw.pdfExcerpts,
    pdfErrors: raw.pdfErrors,
    linkedExcerpts: raw.linkedExcerpts,
    linkedErrors: raw.linkedErrors,
    gateReasons: raw.gateReasons,
    httpStatus: raw.httpStatus,
  };
}
