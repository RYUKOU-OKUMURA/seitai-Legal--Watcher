#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import pino from "pino";
import path from "node:path";
import { resolveRepoRoot } from "./paths.js";
import { runDailyPipeline } from "./pipeline.js";
import { regenerateAdChecklistFromLogs } from "./checklistFromLogs.js";
import { regenerateDailyReportFromLogs } from "./reportFromLogs.js";
import { regenerateManualImpactFromLogs } from "./manualImpactFromLogs.js";
import { regenerateWeeklyReportFromLogs } from "./weeklyFromLogs.js";
import { resetState } from "./resetState.js";
import { isContentChange } from "./changeClassification.js";
import {
  syncChecklistReportToObsidian,
  syncDailyReportToObsidian,
  syncManualImpactReportToObsidian,
  syncWeeklyReportToObsidian,
} from "./obsidianSync.js";
import {
  printValidationResults,
  validateSources,
} from "./validateSources.js";

loadEnv({ path: path.join(resolveRepoRoot(), ".env") });

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const program = new Command()
  .name("legal-watch")
  .description("整体院・整骨院 Legal Watcher CLI");

program
  .command("bootstrap")
  .description("初回ベースライン確立（fetch のみ・LLM スキップ）")
  .option("--date <YYYY-MM-DD>", "対象日（省略時は JST 今日）")
  .action(async (opts: { date?: string }) => {
    try {
      const result = await runDailyPipeline(log, {
        date: opts.date,
        bootstrap: true,
      });
      log.info(
        {
          contentUpdates: result.changes.filter(isContentChange).length,
          failures: result.failures.length,
        },
        "bootstrap complete",
      );
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

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
          contentUpdates: result.changes.filter(isContentChange).length,
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
  .description("data/raw と llm-log から日次レポートを再生成")
  .option("--date <YYYY-MM-DD>", "対象日")
  .action(async (opts: { date?: string }) => {
    try {
      const reportPath = await regenerateDailyReportFromLogs(opts.date);
      log.info({ reportPath }, "daily report regenerated");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("weekly")
  .description("data/raw と llm-log から週次レポートを生成")
  .requiredOption("--week <YYYY-Www>", "対象 ISO week（例: 2026-W22）")
  .action(async (opts: { week: string }) => {
    try {
      const reportPath = await regenerateWeeklyReportFromLogs(opts.week);
      log.info({ reportPath, week: opts.week }, "weekly report generated");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("checklist")
  .description("data/raw と llm-log から広告・LP・SNSチェックリストを生成")
  .requiredOption("--date <YYYY-MM-DD>", "対象日")
  .action(async (opts: { date: string }) => {
    try {
      const reportPath = await regenerateAdChecklistFromLogs(opts.date);
      log.info({ reportPath, date: opts.date }, "ad checklist generated");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("manual-impact")
  .description("data/raw と llm-log から院内マニュアル影響確認を生成")
  .requiredOption("--date <YYYY-MM-DD>", "対象日")
  .action(async (opts: { date: string }) => {
    try {
      const reportPath = await regenerateManualImpactFromLogs(opts.date);
      log.info({ reportPath, date: opts.date }, "manual impact report generated");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("sync-obsidian")
  .description("日次・週次レポート・広告チェックリスト・院内影響確認を Obsidian Vault へ同期")
  .option("--date <YYYY-MM-DD>", "対象日（省略時は JST 今日）")
  .option("--weekly <YYYY-Www>", "対象 ISO week の週次レポートを同期（例: 2026-W22）")
  .option("--checklist <YYYY-MM-DD>", "対象日の広告チェックリストを同期")
  .option("--manual-impact <YYYY-MM-DD>", "対象日の院内マニュアル影響確認を同期")
  .option("--force", "既存の Obsidian 側ファイルを上書きする")
  .action(async (opts: { date?: string; weekly?: string; checklist?: string; manualImpact?: string; force?: boolean }) => {
    try {
      if (
        [opts.date, opts.weekly, opts.checklist, opts.manualImpact].filter((value) => value !== undefined)
          .length > 1
      ) {
        throw new Error("Use only one of --date, --weekly, --checklist, or --manual-impact.");
      }
      if (opts.weekly) {
        const result = await syncWeeklyReportToObsidian({
          week: opts.weekly,
          force: opts.force === true,
        });
        log.info(
          {
            week: result.week,
            sourcePath: result.sourcePath,
            destinationPath: result.destinationPath,
            indexPath: result.indexPath,
            skipped: result.skipped,
          },
          result.skipped
            ? "obsidian weekly report already exists; skipped"
            : "obsidian weekly report synced",
        );
        return;
      }

      if (opts.checklist) {
        const result = await syncChecklistReportToObsidian({
          date: opts.checklist,
          force: opts.force === true,
        });
        log.info(
          {
            date: result.date,
            sourcePath: result.sourcePath,
            destinationPath: result.destinationPath,
            indexPath: result.indexPath,
            skipped: result.skipped,
          },
          result.skipped
            ? "obsidian checklist already exists; skipped"
            : "obsidian checklist synced",
        );
        return;
      }

      if (opts.manualImpact) {
        const result = await syncManualImpactReportToObsidian({
          date: opts.manualImpact,
          force: opts.force === true,
        });
        log.info(
          {
            date: result.date,
            sourcePath: result.sourcePath,
            destinationPath: result.destinationPath,
            indexPath: result.indexPath,
            skipped: result.skipped,
          },
          result.skipped
            ? "obsidian manual impact report already exists; skipped"
            : "obsidian manual impact report synced",
        );
        return;
      }

      const result = await syncDailyReportToObsidian({
        date: opts.date,
        force: opts.force === true,
      });
      log.info(
        {
          date: result.date,
          sourcePath: result.sourcePath,
          destinationPath: result.destinationPath,
          indexPath: result.indexPath,
          topicPaths: result.topicPaths,
          skippedTopicPaths: result.skippedTopicPaths,
          skipped: result.skipped,
        },
        result.skipped
          ? "obsidian daily report already exists; skipped"
          : "obsidian daily report synced",
      );
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("reset-state")
  .description("data/state.json を初期化（任意で raw JSON も削除）")
  .option("--clear-raw", "data/raw/*.json を削除")
  .action(async (opts: { clearRaw?: boolean }) => {
    try {
      await resetState(opts.clearRaw === true);
      log.info({ clearRaw: opts.clearRaw }, "state reset");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("validate-sources")
  .description("enabled ソースの URL を smoke test（200 & 本文長）")
  .option("--date <YYYY-MM-DD>", "URL テンプレート展開の基準日")
  .option("--include-disabled", "disabled ソースも含めて検証する")
  .action(async (opts: { date?: string; includeDisabled?: boolean }) => {
    const results = await validateSources({
      referenceDate: opts.date,
      includeDisabled: opts.includeDisabled === true,
    });
    const ok = printValidationResults(results);
    if (!ok) process.exit(1);
  });

program.parse(process.argv.filter((arg, index) => index < 2 || arg !== "--"));
