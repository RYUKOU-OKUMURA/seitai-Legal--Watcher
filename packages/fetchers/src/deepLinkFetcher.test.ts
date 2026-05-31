import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetectedChange } from "@seitai-legal-watch/core";
import { fetchDeepLinkExcerpts } from "./deepLinkFetcher.js";
import { fetchPdfExcerpt } from "./pdfFetcher.js";

vi.mock("./pdfFetcher.js", () => ({
  fetchPdfExcerpt: vi.fn(async (url: string) => ({
    url,
    textExcerpt: `pdf ${url}`,
    contentHash: `hash:${url}`,
  })),
}));

function change(overrides: Partial<DetectedChange> = {}): DetectedChange {
  return {
    id: "change",
    sourceId: "source",
    sourceName: "Source",
    sourceWeight: "high",
    targetKey: "target",
    url: "https://example.com/news",
    title: "Title",
    detectedAt: "2026-05-31T00:00:00.000Z",
    changeType: "updated",
    bodyExcerpt: "body",
    links: [
      "https://example.com/detail",
      "https://example.com/file.pdf",
      "https://other.example.com/outside",
    ],
    ...overrides,
  };
}

describe("fetchDeepLinkExcerpts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches same-origin HTML and PDF links with limits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        "<html><head><title>Detail</title></head><body><main>Linked body</main></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );

    const result = await fetchDeepLinkExcerpts(change(), {
      maxHtmlLinks: 1,
      maxPdfLinks: 1,
    });

    expect(result.linkedExcerpts).toEqual([
      {
        url: "https://example.com/detail",
        title: "Detail",
        textExcerpt: "Linked body",
      },
    ]);
    expect(fetchPdfExcerpt).toHaveBeenCalledWith("https://example.com/file.pdf");
    expect(result.pdfExcerpts).toHaveLength(1);
    expect(result.linkedErrors).toHaveLength(0);
    expect(result.pdfErrors).toHaveLength(0);
  });

  it("uses the RSS item URL itself as a detail page and follows discovered PDFs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<html><head><title>RSS Detail</title></head><body><main>RSS linked body<a href="/detail.pdf">PDF</a></main></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );

    const result = await fetchDeepLinkExcerpts(
      change({
        targetKey: "rss:https://example.com/news",
        links: [],
      }),
      { maxHtmlLinks: 1, maxPdfLinks: 1 },
    );

    expect(result.linkedExcerpts[0]).toMatchObject({
      url: "https://example.com/news",
      title: "RSS Detail",
      textExcerpt: "RSS linked bodyPDF",
    });
    expect(fetchPdfExcerpt).toHaveBeenCalledWith("https://example.com/detail.pdf");
  });
});
