import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { regenerateDailyReportFromLogs } from "./reportFromLogs.js";

const previousRoot = process.env.LEGAL_WATCH_ROOT;

describe("regenerateDailyReportFromLogs", () => {
  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.LEGAL_WATCH_ROOT;
    } else {
      process.env.LEGAL_WATCH_ROOT = previousRoot;
    }
  });

  it("ignores stale LLM log entries without matching raw snapshots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "legal-watch-report-"));
    process.env.LEGAL_WATCH_ROOT = root;
    await mkdir(path.join(root, "data", "raw"), { recursive: true });
    await mkdir(path.join(root, "reports", "daily"), { recursive: true });

    await writeFile(
      path.join(root, "data", "raw", "current.json"),
      JSON.stringify({
        changeId: "current-change",
        sourceId: "test-source",
        sourceName: "Test source",
        sourceWeight: "low",
        targetKey: "https://example.com/current",
        url: "https://example.com/current",
        title: "Unrelated update",
        detectedAt: "2026-05-26T00:00:00.000Z",
        changeType: "updated",
        bodyExcerpt: "No configured keyword here.",
        links: [],
      }),
      "utf8",
    );

    await writeFile(
      path.join(root, "data", "llm-log.jsonl"),
      `${JSON.stringify({
        at: "2026-05-26T01:00:00.000Z",
        changeId: "stale-change",
        status: "error",
        error: "CURSOR_API_KEY is not set",
      })}\n`,
      "utf8",
    );

    const reportPath = await regenerateDailyReportFromLogs("2026-05-26");
    const markdown = await readFile(reportPath, "utf8");

    expect(markdown).not.toContain("CURSOR_API_KEY is not set");
    expect(markdown).toContain("Unrelated update");
  });
});
