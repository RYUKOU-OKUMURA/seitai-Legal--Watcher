#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import pino from "pino";
import { resolveRepoRoot } from "./paths.js";
import { runDailyPipeline } from "./pipeline.js";
import path from "node:path";

loadEnv({ path: path.join(resolveRepoRoot(), ".env") });

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const program = new Command()
  .name("legal-watch")
  .description("整体院・整骨院 Legal Watcher CLI");

program
  .command("daily")
  .description("巡回・差分検知・分析・日次レポート生成")
  .option("--date <YYYY-MM-DD>", "対象日（省略時は JST 今日）")
  .option("--mock-llm", "LLM をモック（LEGAL_WATCH_MOCK_LLM=true）")
  .action(async (opts: { date?: string; mockLlm?: boolean }) => {
    if (opts.mockLlm) process.env.LEGAL_WATCH_MOCK_LLM = "true";
    try {
      const result = await runDailyPipeline(log, { date: opts.date });
      log.info(
        {
          contentUpdates: result.changes.filter((c) => c.changeType !== "failed").length,
          analyzed: result.analyses.length,
          gated: result.gatedOut.length,
          failures: result.failures.length,
        },
        "daily complete",
      );
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("fetch")
  .description("取得・差分検知のみ（LLM スキップ）")
  .option("--date <YYYY-MM-DD>", "対象日")
  .action(async (opts: { date?: string }) => {
    try {
      await runDailyPipeline(log, { date: opts.date, skipLlm: true });
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("report")
  .description("レポートのみ再生成（fetch/analyze スキップ — 空レポート）")
  .option("--date <YYYY-MM-DD>", "対象日")
  .action(async (opts: { date?: string }) => {
    try {
      await runDailyPipeline(log, {
        date: opts.date,
        reportOnly: true,
        skipLlm: true,
      });
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program.parse();
