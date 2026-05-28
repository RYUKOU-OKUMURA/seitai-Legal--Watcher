import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "@seitai-legal-watch/config";
import { validateSources } from "./validateSources.js";

const defaultConfig: AppConfig = {
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
};

vi.mock("@seitai-legal-watch/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@seitai-legal-watch/config")>()),
  loadConfig: vi.fn(),
}));

describe("validateSources", () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockResolvedValue(defaultConfig);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("x".repeat(600), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("treats today's e-Gov update law list 404 as degraded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T00:05:00.000Z"));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not ready", { status: 404 }));
    const apiConfig: AppConfig = {
      sources: [],
      enabledSources: [
        {
          id: "egov-law-api",
          name: "e-Gov API",
          type: "api",
          url: "https://laws.e-gov.go.jp/api/1/updatelawlists/{YYYYMMDD}",
          weight: "medium",
          alwaysAnalyze: false,
          enabled: true,
        },
      ],
      keywords: [],
      display: {
        operator_label: "Operator",
        checkpoints_heading: "確認ポイント",
      },
    };
    vi.mocked(loadConfig).mockResolvedValueOnce(apiConfig);

    const results = await validateSources({ referenceDate: "2026-05-28" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://laws.e-gov.go.jp/api/1/updatelawlists/20260528",
      expect.any(Object),
    );
    expect(results).toEqual([
      {
        id: "egov-law-api",
        url: "https://laws.e-gov.go.jp/api/1/updatelawlists/20260528",
        ok: true,
        status: 404,
        bodyLength: 9,
        error: "degraded_404_egov_daily_api",
      },
    ]);
  });

  it("does not degrade other date-templated API 404 responses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T00:05:00.000Z"));
    const apiConfig: AppConfig = {
      sources: [],
      enabledSources: [
        {
          id: "other-daily-api",
          name: "Other API",
          type: "api",
          url: "https://example.com/api/{YYYYMMDD}",
          weight: "medium",
          alwaysAnalyze: false,
          enabled: true,
        },
      ],
      keywords: [],
      display: {
        operator_label: "Operator",
        checkpoints_heading: "確認ポイント",
      },
    };
    vi.mocked(loadConfig).mockResolvedValueOnce(apiConfig);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not found", { status: 404 }),
    );

    const results = await validateSources({ referenceDate: "2026-05-28" });

    expect(results).toEqual([
      {
        id: "other-daily-api",
        url: "https://example.com/api/20260528",
        ok: false,
        status: 404,
        bodyLength: 9,
        error: "status=404 bodyLen=9",
      },
    ]);
  });
});
