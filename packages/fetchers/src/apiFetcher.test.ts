import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchApiSnapshots } from "./apiFetcher.js";

describe("fetchApiSnapshots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts e-Gov XML update law items by path and stable id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <DataRoot>
          <ApplData>
            <LawNameListInfo>
              <LawId>425AC0000000027</LawId>
              <LawName>行政手続における特定の個人を識別するための番号の利用等に関する法律</LawName>
              <LawUrl>https://laws.example/document</LawUrl>
            </LawNameListInfo>
          </ApplData>
        </DataRoot>`,
        { status: 200, headers: { "content-type": "text/xml" } },
      ),
    );

    const snapshots = await fetchApiSnapshots(
      {
        id: "egov-law-api",
        name: "e-Gov",
        type: "api",
        url: "https://laws.e-gov.go.jp/api/1/updatelawlists/20260526",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
        stableIdField: "LawId",
        itemsPath: "DataRoot.ApplData.LawNameListInfo",
      },
      "2026-05-26T00:00:00.000Z",
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.targetKey).toBe("api:425AC0000000027");
    expect(snapshots[0]?.title).toContain("行政手続");
  });
});
