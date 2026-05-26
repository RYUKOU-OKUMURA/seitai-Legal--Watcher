import { describe, expect, it } from "vitest";
import type { DetectedChange } from "@seitai-legal-watch/core";
import { detectedChangeToRawSnapshot } from "./rawSnapshot.js";

describe("detectedChangeToRawSnapshot", () => {
  it("maps a detected change to the persisted raw snapshot fields", () => {
    const change: DetectedChange = {
      id: "change-id",
      sourceId: "source-id",
      sourceName: "Source",
      sourceWeight: "high",
      targetKey: "target-key",
      url: "https://example.com/a",
      title: "Title",
      detectedAt: "2026-05-26T00:00:00.000Z",
      changeType: "updated",
      diffText: "diff",
      bodyExcerpt: "excerpt",
      links: ["https://example.com/b"],
      httpStatus: 200,
      pdfExcerpts: [
        {
          url: "https://example.com/a.pdf",
          title: "PDF",
          textExcerpt: "pdf excerpt",
          contentHash: "hash",
        },
      ],
      pdfErrors: [{ url: "https://example.com/b.pdf", error: "too large" }],
      gateReasons: ["not persisted at fetch time"],
    };

    expect(detectedChangeToRawSnapshot(change)).toEqual({
      changeId: "change-id",
      sourceId: "source-id",
      sourceName: "Source",
      sourceWeight: "high",
      targetKey: "target-key",
      url: "https://example.com/a",
      title: "Title",
      detectedAt: "2026-05-26T00:00:00.000Z",
      changeType: "updated",
      bodyExcerpt: "excerpt",
      diffText: "diff",
      links: ["https://example.com/b"],
      httpStatus: 200,
      pdfExcerpts: [
        {
          url: "https://example.com/a.pdf",
          title: "PDF",
          textExcerpt: "pdf excerpt",
          contentHash: "hash",
        },
      ],
      pdfErrors: [{ url: "https://example.com/b.pdf", error: "too large" }],
    });
  });
});
