import { describe, expect, it } from "vitest";
import { loadConfig } from "./loadConfig.js";

describe("loadConfig", () => {
  it("loads Phase 1.2 sources with explicit selectors", async () => {
    const config = await loadConfig();

    expect(config.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "kanpo-html",
          url: "https://www.kanpo.go.jp/",
          enabled: true,
          contentSelector: "main",
          followPdfLinks: false,
        }),
        expect.objectContaining({
          id: "kanto-koshinetsu-judo",
          enabled: true,
          contentSelector: "main",
          followPdfLinks: false,
        }),
        expect.objectContaining({
          id: "tokyo-sejutsusho",
          enabled: true,
          contentSelector: "main",
          followPdfLinks: false,
        }),
        expect.objectContaining({
          id: "kanagawa-sejutsusho",
          enabled: true,
          contentSelector: "#tmp_contents",
          followPdfLinks: false,
        }),
      ]),
    );
  });
});
