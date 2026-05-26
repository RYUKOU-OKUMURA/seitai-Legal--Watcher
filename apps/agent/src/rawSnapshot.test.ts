import { describe, expect, it } from "vitest";
import type { RawSnapshot } from "@seitai-legal-watch/core";
import { rawSnapshotToDetectedChange } from "./rawSnapshot.js";

describe("rawSnapshotToDetectedChange", () => {
  it("restores a detected change from raw snapshot defaults", () => {
    const raw: RawSnapshot = {
      changeId: "change-id",
      url: "https://example.com/a",
      title: "Title",
      detectedAt: "2026-05-26T00:00:00.000Z",
      changeType: "updated",
      bodyExcerpt: "excerpt",
    };

    expect(rawSnapshotToDetectedChange(raw)).toEqual({
      id: "change-id",
      sourceId: "unknown",
      sourceName: "Unknown source",
      sourceWeight: "medium",
      targetKey: "https://example.com/a",
      url: "https://example.com/a",
      title: "Title",
      detectedAt: "2026-05-26T00:00:00.000Z",
      changeType: "updated",
      diffText: undefined,
      bodyExcerpt: "excerpt",
      links: [],
      pdfExcerpts: undefined,
      pdfErrors: undefined,
      gateReasons: undefined,
      httpStatus: undefined,
    });
  });
});
