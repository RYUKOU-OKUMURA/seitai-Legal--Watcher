import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawSnapshot, TargetState } from "@seitai-legal-watch/core";
import type { StateData, StateStore } from "./stateStore.js";

export class JsonStateStore implements StateStore {
  constructor(private readonly root: string) {}

  getRoot(): string {
    return this.root;
  }

  private dataDir(): string {
    return path.join(this.root, "data");
  }

  private statePath(): string {
    return path.join(this.dataDir(), "state.json");
  }

  private fetchLogPath(): string {
    return path.join(this.dataDir(), "fetch-log.jsonl");
  }

  private llmLogPath(): string {
    return path.join(this.dataDir(), "llm-log.jsonl");
  }

  private rawDir(): string {
    return path.join(this.dataDir(), "raw");
  }

  async loadState(): Promise<StateData> {
    try {
      const raw = await readFile(this.statePath(), "utf8");
      const parsed = JSON.parse(raw) as StateData;
      return { targets: parsed.targets ?? {} };
    } catch {
      return { targets: {} };
    }
  }

  async saveState(state: StateData): Promise<void> {
    await mkdir(this.dataDir(), { recursive: true });
    await writeFile(this.statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async getTargetState(targetKey: string): Promise<TargetState | undefined> {
    const state = await this.loadState();
    return state.targets[targetKey];
  }

  async upsertTargetState(targetKey: string, data: TargetState): Promise<void> {
    const state = await this.loadState();
    state.targets[targetKey] = data;
    await this.saveState(state);
  }

  async appendFetchLog(entry: Record<string, unknown>): Promise<void> {
    await mkdir(this.dataDir(), { recursive: true });
    await appendFile(this.fetchLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  }

  async appendLlmLog(entry: Record<string, unknown>): Promise<void> {
    await mkdir(this.dataDir(), { recursive: true });
    await appendFile(this.llmLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  }

  async saveRawSnapshot(snapshot: RawSnapshot): Promise<void> {
    await mkdir(this.rawDir(), { recursive: true });
    const filePath = path.join(this.rawDir(), `${snapshot.changeId}.json`);
    await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
}
