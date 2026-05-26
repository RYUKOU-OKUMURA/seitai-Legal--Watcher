import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateSources } from "./validateSources.js";

vi.mock("@seitai-legal-watch/config", () => ({
  loadConfig: vi.fn(async () => ({
    sources: [
      {
        id: "enabled",
        name: "Enabled",
        type: "html",
        url: "https://example.com/enabled",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
      },
      {
        id: "disabled",
        name: "Disabled",
        type: "html",
        url: "https://example.com/disabled",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: false,
      },
    ],
    enabledSources: [
      {
        id: "enabled",
        name: "Enabled",
        type: "html",
        url: "https://example.com/enabled",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
      },
    ],
    keywords: [],
    display: { operator_label: "Operator", checkpoints_heading: "確認ポイント" },
  })),
  resolveSourceUrl: vi.fn((source: { url: string }) => source.url),
}));

describe("validateSources", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("x".repeat(600), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
  });

  it("validates only enabled sources by default", async () => {
    const results = await validateSources({ referenceDate: "2026-05-26" });

    expect(results.map((r) => r.id)).toEqual(["enabled"]);
  });

  it("validates disabled sources when requested", async () => {
    const results = await validateSources({
      referenceDate: "2026-05-26",
      includeDisabled: true,
    });

    expect(results.map((r) => r.id)).toEqual(["enabled", "disabled"]);
  });
});
