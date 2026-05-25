import type { StateStore } from "./stateStore.js";

/** Phase 3/4 で実装。Phase 1 では未使用。 */
export class SqliteStateStore implements StateStore {
  constructor(_root: string) {
    throw new Error("SqliteStateStore is not implemented in Phase 1");
  }

  getRoot(): string {
    throw new Error("SqliteStateStore is not implemented in Phase 1");
  }

  loadState() {
    return this.unimplemented();
  }

  saveState() {
    return this.unimplemented();
  }

  getTargetState() {
    return this.unimplemented();
  }

  upsertTargetState() {
    return this.unimplemented();
  }

  appendFetchLog() {
    return this.unimplemented();
  }

  appendLlmLog() {
    return this.unimplemented();
  }

  saveRawSnapshot() {
    return this.unimplemented();
  }

  private unimplemented(): never {
    throw new Error("SqliteStateStore is not implemented in Phase 1");
  }
}
