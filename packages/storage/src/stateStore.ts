import type { RawSnapshot, TargetState } from "@seitai-legal-watch/core";

export interface StateData {
  targets: Record<string, TargetState>;
}

export interface StateStore {
  getRoot(): string;
  loadState(): Promise<StateData>;
  saveState(state: StateData): Promise<void>;
  getTargetState(targetKey: string): Promise<TargetState | undefined>;
  upsertTargetState(targetKey: string, data: TargetState): Promise<void>;
  appendFetchLog(entry: Record<string, unknown>): Promise<void>;
  appendLlmLog(entry: Record<string, unknown>): Promise<void>;
  saveRawSnapshot(snapshot: RawSnapshot): Promise<void>;
}
