import { describe, expect, it } from "vitest";
import { resolveSourceUrl } from "./resolveSourceUrl.js";

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
});
