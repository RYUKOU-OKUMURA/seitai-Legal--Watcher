import { describe, expect, it } from "vitest";
import type { DetectedChange } from "@seitai-legal-watch/core";
import { isContentChange, isFetchFailure } from "./changeClassification.js";

function change(changeType: DetectedChange["changeType"]): DetectedChange {
  return {
    id: "c",
    sourceId: "s",
    sourceName: "S",
    sourceWeight: "medium",
    targetKey: "k",
    url: "https://example.com",
    title: "T",
    detectedAt: "2026-05-26T00:00:00.000Z",
    changeType,
    bodyExcerpt: "body",
    links: [],
  };
}

describe("change classification", () => {
  it("separates content changes from fetch failures", () => {
    expect(isContentChange(change("new"))).toBe(true);
    expect(isContentChange(change("updated"))).toBe(true);
    expect(isContentChange(change("deleted"))).toBe(true);
    expect(isContentChange(change("failed"))).toBe(false);

    expect(isFetchFailure(change("failed"))).toBe(true);
    expect(isFetchFailure(change("updated"))).toBe(false);
  });
});
