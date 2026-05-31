import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { retryFailedAnalysesForDate } from "./retryAnalysis.js";

const previousMock = process.env.LEGAL_WATCH_MOCK_LLM;

beforeEach(() => {
  process.env.LEGAL_WATCH_MOCK_LLM = "true";
});

afterEach(() => {
  if (previousMock === undefined) delete process.env.LEGAL_WATCH_MOCK_LLM;
  else process.env.LEGAL_WATCH_MOCK_LLM = previousMock;
});

describe("retryFailedAnalysesForDate", () => {
  it("retries error log entries from raw snapshots and appends ok results", async () => {
    const testRoot = await mkdtemp(path.join(os.tmpdir(), "legal-watch-retry-"));
    await mkdir(path.join(testRoot, "data", "raw"), { recursive: true });
    await writeFile(
      path.join(testRoot, "data", "llm-log.jsonl"),
      `${JSON.stringify({
        at: "2026-05-28T01:00:00.000Z",
        changeId: "change-1",
        status: "error",
        error: "bad json",
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(testRoot, "data", "raw", "change-1.json"),
      `${JSON.stringify({
        changeId: "change-1",
        sourceId: "source",
        sourceName: "Source",
        sourceWeight: "high",
        targetKey: "target",
        url: "https://example.com/source",
        title: "Retry target",
        detectedAt: "2026-05-28T00:00:00.000Z",
        changeType: "updated",
        bodyExcerpt: "body",
        links: [],
        gateReasons: ["high_weight"],
      })}\n`,
      "utf8",
    );

    const result = await retryFailedAnalysesForDate("2026-05-28", {
      root: testRoot,
      timezone: "Asia/Tokyo",
    });

    expect(result).toMatchObject({
      retried: 1,
      succeeded: 1,
      failed: 0,
    });
    const llmLog = await readFile(path.join(testRoot, "data", "llm-log.jsonl"), "utf8");
    expect(llmLog).toContain('"status":"ok"');
    expect(llmLog).toContain('"retryOf":"2026-05-28"');
  });
});
