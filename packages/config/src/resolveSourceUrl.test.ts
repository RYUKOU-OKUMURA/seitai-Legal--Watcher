import { describe, expect, it } from "vitest";
import { resolveSourceUrl } from "./resolveSourceUrl.js";
import { watchTargetSchema } from "./schemas.js";

describe("resolveSourceUrl", () => {
  it("expands YYYYMM from reference date in JST", () => {
    const url = resolveSourceUrl(
      {
        id: "mhlw",
        name: "test",
        type: "html",
        url: "https://example.com/list_{YYYYMM}.html",
        weight: "high",
        alwaysAnalyze: false,
        enabled: true,
      },
      "2026-05-26",
    );
    expect(url).toBe("https://example.com/list_202605.html");
  });

  it("expands YYYYMMDD and accepts pdf source options", () => {
    const source = watchTargetSchema.parse({
      id: "pdf",
      name: "PDF",
      type: "pdf",
      url: "https://example.com/{YYYYMMDD}/notice.pdf",
      weight: "medium",
      followPdfLinks: true,
      pdfMaxLinks: 2,
    });
    expect(resolveSourceUrl(source, "2026-05-26")).toBe(
      "https://example.com/20260526/notice.pdf",
    );
  });
});
