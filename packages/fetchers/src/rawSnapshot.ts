import type { DetectedChange, RawSnapshot } from "@seitai-legal-watch/core";

export function detectedChangeToRawSnapshot(change: DetectedChange): RawSnapshot {
  return {
    changeId: change.id,
    sourceId: change.sourceId,
    sourceName: change.sourceName,
    sourceWeight: change.sourceWeight,
    targetKey: change.targetKey,
    url: change.url,
    title: change.title,
    detectedAt: change.detectedAt,
    changeType: change.changeType,
    bodyExcerpt: change.bodyExcerpt,
    diffText: change.diffText,
    links: change.links,
    httpStatus: change.httpStatus,
    pdfExcerpts: change.pdfExcerpts,
    pdfErrors: change.pdfErrors,
    linkedExcerpts: change.linkedExcerpts,
    linkedErrors: change.linkedErrors,
  };
}
