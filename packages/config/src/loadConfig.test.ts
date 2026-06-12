import { describe, expect, it } from "vitest";
import { loadConfig, resolveKeywordsForSource } from "./loadConfig.js";

describe("loadConfig", () => {
  it("loads Phase 1.2 sources with explicit selectors", async () => {
    const config = await loadConfig();

    expect(config.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "kanpo-html",
          url: "https://www.kanpo.go.jp/",
          // トップページの号数変化しか拾えないため無効化（中身監視は将来課題）
          enabled: false,
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

  it("loads keyword profiles and assigns strict to egov-law-api", async () => {
    const config = await loadConfig();

    expect(config.keywordProfiles.strict).toEqual(
      expect.arrayContaining(["柔道整復", "療養費", "景品表示法"]),
    );
    // 汎用語は strict に含めない（法令名への誤マッチ防止）
    expect(config.keywordProfiles.strict).not.toContain("契約");
    expect(config.keywordProfiles.strict).not.toContain("指導");
    expect(config.keywordProfiles.strict).not.toContain("はり");

    const egovLawApi = config.sources.find((s) => s.id === "egov-law-api");
    expect(egovLawApi?.keywordProfile).toBe("strict");
  });

  it("loads the new committee and CAA release sources", async () => {
    const config = await loadConfig();

    expect(config.enabledSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "mhlw-judo-senmon-iinkai", weight: "high" }),
        expect.objectContaining({ id: "mhlw-ahaki-senmon-iinkai", weight: "high" }),
        expect.objectContaining({ id: "caa-hyoji-sochimeirei", weight: "high" }),
      ]),
    );
  });
});

describe("resolveKeywordsForSource", () => {
  const config = {
    keywords: ["全体A", "全体B"],
    keywordProfiles: { strict: ["厳格A"] },
  };

  it("returns default keywords when no profile is set", () => {
    expect(resolveKeywordsForSource({}, config)).toEqual(["全体A", "全体B"]);
    expect(resolveKeywordsForSource(undefined, config)).toEqual(["全体A", "全体B"]);
  });

  it("returns the profile keywords when set", () => {
    expect(resolveKeywordsForSource({ keywordProfile: "strict" }, config)).toEqual([
      "厳格A",
    ]);
  });

  it("throws on an unknown profile", () => {
    expect(() =>
      resolveKeywordsForSource({ keywordProfile: "missing" }, config),
    ).toThrow(/unknown keywordProfile/);
  });
});
