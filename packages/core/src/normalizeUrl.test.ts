import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./normalizeUrl.js";

describe("normalizeUrl", () => {
  it("removes hash and normalizes trailing slash", () => {
    expect(normalizeUrl("https://example.com/path/#frag")).toBe(
      "https://example.com/path",
    );
  });

  it("sorts query params", () => {
    const a = normalizeUrl("https://example.com?b=2&a=1");
    const b = normalizeUrl("https://example.com?a=1&b=2");
    expect(a).toBe(b);
  });
});
