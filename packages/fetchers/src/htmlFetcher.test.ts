import * as cheerio from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPdfLinks, fetchHtmlSnapshot } from "./htmlFetcher.js";
import { fetchPdfExcerpts } from "./pdfFetcher.js";

vi.mock("./pdfFetcher.js", () => ({
  fetchPdfExcerpts: vi.fn(async (urls: string[]) => ({
    excerpts: urls.map((url) => ({
      url,
      textExcerpt: `text for ${url}`,
      contentHash: `hash:${url}`,
    })),
    errors: [],
  })),
}));

describe("extractPdfLinks", () => {
  it("normalizes relative, absolute, query-string, and duplicate PDF links", () => {
    const $ = cheerio.load(`
      <main>
        <a href="/files/a.pdf">a</a>
        <a href="https://example.com/files/a.pdf">dup</a>
        <a href="./b.pdf?download=1">b</a>
        <a href="/files/c.docx">c</a>
      </main>
    `);

    expect(extractPdfLinks($, "https://example.com/base/page.html", "main")).toEqual([
      "https://example.com/base/b.pdf?download=1",
      "https://example.com/files/a.pdf",
    ]);
  });

  it("limits PDF links to the selected scope", () => {
    const $ = cheerio.load(`
      <main>
        <a href="/outside.pdf">outside</a>
        <section class="target">
          <a href="/b.pdf">b</a>
          <a href="/a.pdf">a</a>
          <a href="/c.pdf">c</a>
        </section>
      </main>
    `);

    expect(
      extractPdfLinks($, "https://example.com/page.html", ".target", 2),
    ).toEqual(["https://example.com/a.pdf", "https://example.com/b.pdf"]);
  });
});

describe("fetchHtmlSnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes followed PDF hashes in the parent HTML snapshot", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<html><head><title>T</title></head><body><main>Body<a href="/a.pdf">PDF</a></main></body></html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    );

    const snapshot = await fetchHtmlSnapshot(
      {
        id: "html",
        name: "HTML",
        type: "html",
        url: "https://example.com/index.html",
        weight: "high",
        alwaysAnalyze: false,
        enabled: true,
        contentSelector: "main",
        followPdfLinks: true,
      },
      "2026-05-26T00:00:00.000Z",
    );

    expect(fetchPdfExcerpts).toHaveBeenCalledWith(["https://example.com/a.pdf"]);
    expect(snapshot.pdfExcerpts?.[0]?.contentHash).toBe("hash:https://example.com/a.pdf");
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
