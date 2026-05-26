import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText() {
      return { text: " PDF body\nfrom fixture " };
    }

    async destroy() {
      return undefined;
    }
  },
}));

const { fetchPdfSnapshot } = await import("./pdfFetcher.js");

describe("fetchPdfSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a snapshot for a standalone PDF source", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );

    const snapshot = await fetchPdfSnapshot(
      {
        id: "pdf",
        name: "PDF source",
        type: "pdf",
        url: "https://example.com/a.pdf",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
      },
      "2026-05-26T00:00:00.000Z",
    );

    expect(snapshot.targetKey).toBe("https://example.com/a.pdf");
    expect(snapshot.bodyText).toBe("PDF body from fixture");
    expect(snapshot.pdfExcerpts?.[0]?.textExcerpt).toBe("PDF body from fixture");
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
