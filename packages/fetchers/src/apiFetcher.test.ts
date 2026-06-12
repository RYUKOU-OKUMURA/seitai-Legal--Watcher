import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiEmptyResultError, fetchApiSnapshots } from "./apiFetcher.js";

describe("fetchApiSnapshots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats e-Gov 404 with nonzero Result.Code as empty even if the message wording changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <DataRoot>
          <Result>
            <Code>1</Code>
            <Message>該当するデータが見つかりません。</Message>
          </Result>
        </DataRoot>`,
        { status: 404, headers: { "content-type": "text/xml" } },
      ),
    );

    await expect(
      fetchApiSnapshots(
        {
          id: "egov-law-api",
          name: "e-Gov",
          type: "api",
          url: "https://laws.e-gov.go.jp/api/1/updatelawlists/20260612",
          weight: "medium",
          alwaysAnalyze: false,
          enabled: true,
          stableIdField: "LawId",
          itemsPath: "DataRoot.ApplData.LawNameListInfo",
        },
        "2026-06-12T00:00:00.000Z",
      ),
    ).rejects.toBeInstanceOf(ApiEmptyResultError);
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
    expect(snapshots[0]?.targetKey).toBe("api:egov-law-api:425AC0000000027");
    expect(snapshots[0]?.title).toContain("行政手続");
  });

  it("scopes stable ids by source id so API sources do not collide", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify([{ LawId: "same-law", LawName: "Same law" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const first = await fetchApiSnapshots(
      {
        id: "source-a",
        name: "Source A",
        type: "api",
        url: "https://example.com/a",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
        stableIdField: "LawId",
      },
      "2026-05-26T00:00:00.000Z",
    );
    const second = await fetchApiSnapshots(
      {
        id: "source-b",
        name: "Source B",
        type: "api",
        url: "https://example.com/b",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
        stableIdField: "LawId",
      },
      "2026-05-26T00:00:00.000Z",
    );

    expect(first[0]?.targetKey).toBe("api:source-a:same-law");
    expect(second[0]?.targetKey).toBe("api:source-b:same-law");
    expect(first[0]?.targetKey).not.toBe(second[0]?.targetKey);
  });

  it("deduplicates repeated records by scoped target key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { LawId: "same-law", LawName: "First version" },
          { LawId: "same-law", LawName: "Last version" },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const snapshots = await fetchApiSnapshots(
      {
        id: "source-a",
        name: "Source A",
        type: "api",
        url: "https://example.com/a",
        weight: "medium",
        alwaysAnalyze: false,
        enabled: true,
        stableIdField: "LawId",
      },
      "2026-05-26T00:00:00.000Z",
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.targetKey).toBe("api:source-a:same-law");
    expect(snapshots[0]?.title).toBe("Last version");
  });
});
