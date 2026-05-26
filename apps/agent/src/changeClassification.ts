import type { DetectedChange } from "@seitai-legal-watch/core";

export function isFetchFailure(change: DetectedChange): boolean {
  return change.changeType === "failed";
}

export function isContentChange(change: DetectedChange): boolean {
  return !isFetchFailure(change);
}
