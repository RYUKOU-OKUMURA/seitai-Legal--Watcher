#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import pino from "pino";
import path from "node:path";
import { resolveRepoRoot } from "./paths.js";
import { runDailyPipeline } from "./pipeline.js";
import { regenerateAdChecklistFromLogs } from "./checklistFromLogs.js";
import { regenerateDailyReportFromLogs } from "./reportFromLogs.js";
import { regeneratePracticalDraftsFromLogs } from "./draftsFromLogs.js";
import { regenerateManualImpactFromLogs } from "./manualImpactFromLogs.js";
import {
  formatReviewItems,
  importLatestAnalysesToReviewDb,
  listReviewItems,
  setReviewItemStatus,
} from "./reviewStatus.js";
import {
  collectReviewQueueEntries,
  formatReviewQueueResult,
  writeReviewQueueMarkdown,
} from "./reviewQueue.js";
import { regenerateWeeklyReportFromLogs } from "./weeklyFromLogs.js";
import { resetState } from "./resetState.js";
import { isContentChange } from "./changeClassification.js";
import {
  syncChecklistReportToObsidian,
  syncDailyReportToObsidian,
  syncDraftsReportToObsidian,
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
  .command("drafts")
  .description("data/raw と llm-log から実務コミュニケーション下書きを生成")
  .requiredOption("--date <YYYY-MM-DD>", "対象日")
  .action(async (opts: { date: string }) => {
    try {
      const reportPath = await regeneratePracticalDraftsFromLogs(opts.date);
      log.info({ reportPath, date: opts.date }, "practical drafts generated");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("review-import")
  .description("data/llm-log.jsonl の最新 Analysis を SQLite watch.db に取り込む")
  .option("--date <YYYY-MM-DD>", "対象日（省略時は raw がある全最新 Analysis）")
  .action(async (opts: { date?: string }) => {
    try {
      const result = await importLatestAnalysesToReviewDb({ date: opts.date });
      log.info(
        {
          dbPath: result.dbPath,
          date: result.date,
          imported: result.imported,
          skippedMissingRaw: result.skippedMissingRaw,
          skippedOutsideDate: result.skippedOutsideDate,
        },
        "review analyses imported",
      );
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("review-status")
  .description("SQLite watch.db の確認ステータスを表示")
  .option("--date <YYYY-MM-DD>", "対象日")
  .option("--status <status>", "確認ステータスで絞り込み")
  .action(async (opts: { date?: string; status?: string }) => {
    try {
      const items = await listReviewItems({
        date: opts.date,
        status: opts.status,
      });
      console.log(formatReviewItems(items));
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("review-queue")
  .description("SQLite watch.db から今日確認すべき項目の Markdown を生成")
  .option("--date <YYYY-MM-DD>", "対象日（省略時は JST 今日）")
  .action(async (opts: { date?: string }) => {
    try {
      const result = await collectReviewQueueEntries({ date: opts.date });
      const reportPath = await writeReviewQueueMarkdown(result);
      console.log(formatReviewQueueResult(result));
      log.info({ reportPath, date: result.date, targetCount: result.entries.length }, "review queue generated");
    } catch (err) {
      log.error(err);
      process.exit(1);
    }
  });

program
  .command("review-set-status")
  .description("Analysis の確認ステータスを明示的に更新")
  .option("--analysis-id <analysisId>", "対象 Analysis ID")
  .option("--change-id <changeId>", "対象 changeId（最新 Analysis を更新）")
  .requiredOption("--status <status>", "new/reviewing/confirmed/action_required/expert_review_required/ignored/archived")
  .option("--note <note>", "確認メモ")
  .option("--by <operator>", "確認者")
  .action(
    async (opts: {
      analysisId?: string;
      changeId?: string;
      status: string;
      note?: string;
      by?: string;
    }) => {
      try {
        const item = await setReviewItemStatus({
          analysisId: opts.analysisId,
          changeId: opts.changeId,
          status: opts.status,
          note: opts.note,
          confirmedBy: opts.by,
        });
        log.info(
          {
            analysisId: item.analysisId,
            changeId: item.changeId,
            status: item.status,
            confirmedAt: item.confirmedAt,
          },
          "review status updated",
        );
      } catch (err) {
        log.error(err);
        process.exit(1);
      }
    },
  );

program
  .command("review-confirm")
  .description("Analysis を確認済みにする")
  .option("--analysis-id <analysisId>", "対象 Analysis ID")
  .option("--change-id <changeId>", "対象 changeId（最新 Analysis を更新）")
  .option("--note <note>", "確認メモ")
  .option("--by <operator>", "確認者")
  .action(
    async (opts: {
      analysisId?: string;
      changeId?: string;
      note?: string;
      by?: string;
    }) => {
      try {
        const item = await setReviewItemStatus({
          analysisId: opts.analysisId,
          changeId: opts.changeId,
          status: "confirmed",
          note: opts.note,
          confirmedBy: opts.by,
        });
        log.info(
          {
            analysisId: item.analysisId,
            changeId: item.changeId,
            status: item.status,
            confirmedAt: item.confirmedAt,
          },
          "review item confirmed",
        );
      } catch (err) {
        log.error(err);
        process.exit(1);
      }
    },
  );

program
  .command("review-unconfirm")
  .description("Analysis の確認済み状態を未確認に戻す")
  .option("--analysis-id <analysisId>", "対象 Analysis ID")
  .option("--change-id <changeId>", "対象 changeId（最新 Analysis を更新）")
  .option("--note <note>", "確認メモ")
  .action(
    async (opts: {
      analysisId?: string;
      changeId?: string;
      note?: string;
    }) => {
      try {
        const item = await setReviewItemStatus({
          analysisId: opts.analysisId,
          changeId: opts.changeId,
          status: "new",
          note: opts.note,
        });
        log.info(
          {
            analysisId: item.analysisId,
            changeId: item.changeId,
            status: item.status,
          },
          "review item marked unconfirmed",
        );
      } catch (err) {
        log.error(err);
        process.exit(1);
      }
    },
  );

program
  .command("sync-obsidian")
  .description("日次・週次レポート・広告チェックリスト・院内影響確認・転用下書きを Obsidian Vault へ同期")
  .option("--date <YYYY-MM-DD>", "対象日（省略時は JST 今日）")
  .option("--weekly <YYYY-Www>", "対象 ISO week の週次レポートを同期（例: 2026-W22）")
  .option("--checklist <YYYY-MM-DD>", "対象日の広告チェックリストを同期")
  .option("--manual-impact <YYYY-MM-DD>", "対象日の院内マニュアル影響確認を同期")
  .option("--drafts <YYYY-MM-DD>", "対象日の実務コミュニケーション下書きを同期")
  .option("--force", "既存の Obsidian 側ファイルを上書きする")
  .action(async (opts: { date?: string; weekly?: string; checklist?: string; manualImpact?: string; drafts?: string; force?: boolean }) => {
    try {
      if (
        [opts.date, opts.weekly, opts.checklist, opts.manualImpact, opts.drafts].filter((value) => value !== undefined)
          .length > 1
      ) {
        throw new Error("Use only one of --date, --weekly, --checklist, --manual-impact, or --drafts.");
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

      if (opts.drafts) {
        const result = await syncDraftsReportToObsidian({
          date: opts.drafts,
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
            ? "obsidian practical drafts already exists; skipped"
            : "obsidian practical drafts synced",
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
