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

function snapshotWithPdfError(error: string): FetchSnapshot {
  const base = {
    sourceId: "s",
    sourceName: "S",
    targetKey: "https://example.com",
    url: "https://example.com",
    title: "Title",
    bodyText: "Body",
    links: ["https://example.com/a.pdf"],
    pdfExcerpts: [],
    pdfErrors: [{ url: "https://example.com/a.pdf", error }],
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

  it("marks parent snapshot updated when only followed PDF error changes", () => {
    const prev = snapshotToTargetState(snapshotWithPdfError("content-type text/html"));
    const current = snapshotWithPdfError("PDF too large");

    expect(resolveChangeType(prev, current)).toBe("updated");
    expect(current.contentHash).not.toBe(prev.contentHash);
  });
});
