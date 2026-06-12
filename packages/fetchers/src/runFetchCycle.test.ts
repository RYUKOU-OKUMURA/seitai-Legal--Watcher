import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawSnapshot, TargetState, WatchTargetConfig } from "@seitai-legal-watch/core";
import type { StateData, StateStore } from "@seitai-legal-watch/storage";
import { runFetchCycle } from "./runFetchCycle.js";

class MemoryStateStore implements StateStore {
  readonly fetchLogs: Record<string, unknown>[] = [];
  readonly rawSnapshots: RawSnapshot[] = [];
  readonly targets = new Map<string, TargetState>();

  getRoot(): string {
    return "/tmp/legal-watch-test";
  }

  async loadState(): Promise<StateData> {
    return { targets: Object.fromEntries(this.targets) };
  }

  async saveState(state: StateData): Promise<void> {
    this.targets.clear();
    for (const [key, value] of Object.entries(state.targets)) {
      this.targets.set(key, value);
    }
  }

  async getTargetState(targetKey: string): Promise<TargetState | undefined> {
    return this.targets.get(targetKey);
  }

  async upsertTargetState(targetKey: string, data: TargetState): Promise<void> {
    this.targets.set(targetKey, data);
  }

  async appendFetchLog(entry: Record<string, unknown>): Promise<void> {
    this.fetchLogs.push(entry);
  }

  async appendLlmLog(): Promise<void> {
    throw new Error("appendLlmLog is not used by runFetchCycle");
  }

  async saveRawSnapshot(snapshot: RawSnapshot): Promise<void> {
    this.rawSnapshots.push(snapshot);
  }
}

describe("runFetchCycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a failed change and raw snapshot when a source throws", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not ready", { status: 404 }),
    );
    const store = new MemoryStateStore();
    const source: WatchTargetConfig = {
      id: "egov-law-api",
      name: "e-Gov法令API（更新法令一覧）",
      type: "api",
      url: "https://laws.e-gov.go.jp/api/1/updatelawlists/{YYYYMMDD}",
      weight: "medium",
      alwaysAnalyze: false,
      enabled: true,
      stableIdField: "LawId",
      itemsPath: "DataRoot.ApplData.LawNameListInfo",
    };

    const result = await runFetchCycle(
      [source],
      store,
      "2026-05-28T00:05:00.000Z",
      "2026-05-28",
    );
    const { changes } = result;

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      sourceId: "egov-law-api",
      changeType: "failed",
      targetKey: "source:egov-law-api",
      url: "https://laws.e-gov.go.jp/api/1/updatelawlists/20260528",
      httpStatus: 0,
    });
    expect(store.fetchLogs).toHaveLength(1);
    expect(store.fetchLogs[0]).toMatchObject({
      at: "2026-05-28T00:05:00.000Z",
      sourceId: "egov-law-api",
    });
    expect(store.rawSnapshots).toHaveLength(1);
    expect(store.rawSnapshots[0]).toMatchObject({
      changeId: changes[0]?.id,
      sourceId: "egov-law-api",
      changeType: "failed",
      url: "https://laws.e-gov.go.jp/api/1/updatelawlists/20260528",
      httpStatus: 0,
    });
    expect(result.sourceRuns).toEqual([
      expect.objectContaining({
        sourceId: "egov-law-api",
        status: "failed",
        changeCount: 1,
      }),
    ]);
  });

  it("records e-Gov law API no-result 404 as an empty source run", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <DataRoot>
          <Result>
            <Code>1</Code>
            <Message>取得結果が０件でした。取得条件に誤りがないかご確認ください。</Message>
          </Result>
          <ApplData><Date>20260531</Date></ApplData>
        </DataRoot>`,
        { status: 404, headers: { "content-type": "text/xml" } },
      ),
    );
    const store = new MemoryStateStore();
    const source: WatchTargetConfig = {
      id: "egov-law-api",
      name: "e-Gov法令API（更新法令一覧）",
      type: "api",
      url: "https://laws.e-gov.go.jp/api/1/updatelawlists/{YYYYMMDD}",
      weight: "medium",
      alwaysAnalyze: false,
      enabled: true,
      stableIdField: "LawId",
      itemsPath: "DataRoot.ApplData.LawNameListInfo",
    };

    const result = await runFetchCycle(
      [source],
      store,
      "2026-05-31T00:05:00.000Z",
      "2026-05-31",
    );

    expect(result.changes).toHaveLength(0);
    expect(store.rawSnapshots).toHaveLength(0);
    expect(store.fetchLogs[0]).toMatchObject({
      sourceId: "egov-law-api",
      httpStatus: 404,
      changeType: "empty",
    });
    expect(result.sourceRuns).toEqual([
      expect.objectContaining({
        sourceId: "egov-law-api",
        status: "empty",
        httpStatus: 404,
        snapshotCount: 0,
        changeCount: 0,
      }),
    ]);
  });

  it("does not treat non e-Gov API no-result 404 as empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <DataRoot>
          <Result>
            <Code>1</Code>
            <Message>取得結果が０件でした。取得条件に誤りがないかご確認ください。</Message>
          </Result>
        </DataRoot>`,
        { status: 404, headers: { "content-type": "text/xml" } },
      ),
    );
    const store = new MemoryStateStore();
    const source: WatchTargetConfig = {
      id: "other-api",
      name: "Other API",
      type: "api",
      url: "https://example.com/api",
      weight: "medium",
      alwaysAnalyze: false,
      enabled: true,
      itemsPath: "DataRoot.ApplData.Items",
    };

    const result = await runFetchCycle(
      [source],
      store,
      "2026-05-31T00:05:00.000Z",
    );

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.changeType).toBe("failed");
    expect(result.sourceRuns[0]).toMatchObject({
      sourceId: "other-api",
      status: "failed",
      httpStatus: 404,
    });
  });

  it("records sources yielding zero snapshots as empty source runs", async () => {
    // RSS 2.0 でも Atom でも RDF でもない XML → snapshot 0件
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`<?xml version="1.0"?><unknown><thing/></unknown>`, {
        status: 200,
        headers: { "content-type": "application/xml" },
      }),
    );
    const store = new MemoryStateStore();
    const source: WatchTargetConfig = {
      id: "rss-source",
      name: "RSS source",
      type: "rss",
      url: "https://example.com/feed.xml",
      weight: "medium",
      alwaysAnalyze: false,
      enabled: true,
    };

    const result = await runFetchCycle(
      [source],
      store,
      "2026-06-12T00:05:00.000Z",
    );

    expect(result.changes).toHaveLength(0);
    expect(store.fetchLogs[0]).toMatchObject({
      sourceId: "rss-source",
      targetKey: "source:rss-source",
      changeType: "empty",
    });
    expect(result.sourceRuns[0]).toMatchObject({
      sourceId: "rss-source",
      status: "empty",
      snapshotCount: 0,
      changeCount: 0,
    });
    expect(result.sourceRuns[0]?.note).toContain("取得0件");
  });

  it("records RSS non-2xx responses as failed source runs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("blocked", { status: 403 }),
    );
    const store = new MemoryStateStore();
    const source: WatchTargetConfig = {
      id: "rss-source",
      name: "RSS source",
      type: "rss",
      url: "https://example.com/feed.xml",
      weight: "medium",
      alwaysAnalyze: false,
      enabled: true,
    };

    const result = await runFetchCycle(
      [source],
      store,
      "2026-05-31T00:05:00.000Z",
    );

    expect(result.changes).toHaveLength(1);
    expect(result.sourceRuns[0]).toMatchObject({
      sourceId: "rss-source",
      status: "failed",
      changeCount: 1,
    });
  });
});
