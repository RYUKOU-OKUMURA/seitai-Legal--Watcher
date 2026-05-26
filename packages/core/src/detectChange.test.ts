import { describe, expect, it } from "vitest";
import { hashFromSnapshot, resolveChangeType, snapshotToTargetState } from "./detectChange.js";
import type { FetchSnapshot } from "./types.js";

function snapshot(pdfHash: string): FetchSnapshot {
  const base = {
    sourceId: "s",
    sourceName: "S",
    targetKey: "https://example.com",
    url: "https://example.com",
    title: "Title",
    bodyText: "Body",
    links: [],
    pdfExcerpts: [
      {
        url: "https://example.com/a.pdf",
        textExcerpt: "PDF",
        contentHash: pdfHash,
      },
    ],
    fetchedAt: "2026-05-26T00:00:00.000Z",
    httpStatus: 200,
  };
  return { ...base, contentHash: hashFromSnapshot(base) };
}

describe("PDF-aware change detection", () => {
  it("marks parent snapshot updated when only followed PDF hash changes", () => {
    const prev = snapshotToTargetState(snapshot("old"));
    const current = snapshot("new");

    expect(resolveChangeType(prev, current)).toBe("updated");
  });
});
