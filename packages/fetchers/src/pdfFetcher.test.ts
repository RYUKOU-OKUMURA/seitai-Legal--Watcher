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

const { fetchPdfExcerpts, fetchPdfSnapshot } = await import("./pdfFetcher.js");

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

  it("records an error when content-length exceeds the PDF budget", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-length": String(10 * 1024 * 1024 + 1),
        },
      }),
    );

    const result = await fetchPdfExcerpts(["https://example.com/large.pdf"]);

    expect(result.excerpts).toHaveLength(0);
    expect(result.errors[0]?.url).toBe("https://example.com/large.pdf");
    expect(result.errors[0]?.error).toContain("PDF too large");
  });

  it("records an error when the response is not a PDF", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>not pdf</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const result = await fetchPdfExcerpts(["https://example.com/not-pdf.pdf"]);

    expect(result.excerpts).toHaveLength(0);
    expect(result.errors[0]?.error).toContain("Unexpected PDF content-type");
  });
});
