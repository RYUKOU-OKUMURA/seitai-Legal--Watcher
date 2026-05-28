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

    const changes = await runFetchCycle(
      [source],
      store,
      "2026-05-28T00:05:00.000Z",
      "2026-05-28",
    );

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
  });
});
