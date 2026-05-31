import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "@seitai-legal-watch/config";
import type { Analysis, DailyRunResult, DetectedChange } from "@seitai-legal-watch/core";
import { ruleGate } from "@seitai-legal-watch/core";
import {
  detectedChangeToRawSnapshot,
  fetchDeepLinkExcerpts,
  runFetchCycle,
} from "@seitai-legal-watch/fetchers";
import { analyzeChange } from "@seitai-legal-watch/llm";
import { generateDailyReportMarkdown } from "@seitai-legal-watch/reports";
import { JsonStateStore } from "@seitai-legal-watch/storage";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import type { Logger } from "pino";
import { isFetchFailure } from "./changeClassification.js";
import { dailyReportPath, resolveRepoRoot } from "./paths.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface PipelineOptions {
  skipLlm?: boolean;
  reportOnly?: boolean;
  bootstrap?: boolean;
  date?: string;
}

export async function runDailyPipeline(
  log: Logger,
  options: PipelineOptions = {},
): Promise<DailyRunResult> {
  const root = resolveRepoRoot();
  const tz = process.env.LEGAL_WATCH_TIMEZONE ?? "Asia/Tokyo";
  const date = options.date ?? dayjs().tz(tz).format("YYYY-MM-DD");
  const fetchedAt = new Date().toISOString();
  const isBootstrap = options.bootstrap === true;

  const config = await loadConfig();
  const store = new JsonStateStore(root);

  let changes: DetectedChange[] = [];
  let sourceRuns: DailyRunResult["sourceRuns"] = [];
  if (!options.reportOnly) {
    log.info({ sources: config.enabledSources.length, bootstrap: isBootstrap }, "fetch cycle start");
    const fetchResult = await runFetchCycle(
      config.enabledSources,
      store,
      fetchedAt,
      date,
    );
    changes = fetchResult.changes;
    sourceRuns = fetchResult.sourceRuns;
    log.info({ changes: changes.length }, "fetch cycle done");
  }

  const gatedOut: DetectedChange[] = [];
  const toAnalyze: DetectedChange[] = [];
  const failures = changes.filter(isFetchFailure);
  const runLlm = !options.skipLlm && !options.reportOnly && !isBootstrap;

  for (const change of changes) {
    if (isFetchFailure(change)) continue;
    const source = config.enabledSources.find((s) => s.id === change.sourceId);
    const gate = ruleGate(
      change,
      config.keywords,
      change.sourceWeight,
      source?.alwaysAnalyze ?? false,
    );
    change.gatePass = gate.pass;
    change.gateReasons = gate.reasons;
    if (!isBootstrap && gate.pass) {
      try {
        if (runLlm) {
          const deep = await fetchDeepLinkExcerpts(change);
          change.linkedExcerpts = deep.linkedExcerpts;
          change.linkedErrors = deep.linkedErrors;
          change.pdfExcerpts = [...(change.pdfExcerpts ?? []), ...deep.pdfExcerpts];
          change.pdfErrors = [...(change.pdfErrors ?? []), ...deep.pdfErrors];
          if (deep.linkedErrors.length > 0 || deep.pdfErrors.length > 0) {
            log.warn(
              {
                changeId: change.id,
                linkedErrors: deep.linkedErrors.length,
                pdfErrors: deep.pdfErrors.length,
              },
              "deep link fetch had errors",
            );
          }
          await store.saveRawSnapshot(detectedChangeToRawSnapshot(change));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        change.linkedErrors = [
          ...(change.linkedErrors ?? []),
          { url: change.url, error: `deep fetch failed: ${message}` },
        ];
        await store.saveRawSnapshot(detectedChangeToRawSnapshot(change));
        log.warn({ changeId: change.id, err: message }, "deep link fetch failed");
      }
      toAnalyze.push(change);
    } else if (!gate.pass) gatedOut.push(change);
    else if (isBootstrap) {
      change.gateReasons = [...(change.gateReasons ?? []), "bootstrap_skip_llm"];
    }
  }

  const analyses: Analysis[] = [];
  const analysisFailures: { changeId: string; error: string }[] = [];

  if (runLlm) {
    for (const change of toAnalyze) {
      try {
        const gate = { pass: true, reasons: change.gateReasons ?? [] };
        const analysis = await analyzeChange(change, gate, { cwd: root });
        analyses.push(analysis);
        await store.appendLlmLog({
          at: fetchedAt,
          changeId: change.id,
          importance: analysis.importance,
          status: "ok",
          analysis,
        });
        log.info({ changeId: change.id, importance: analysis.importance }, "analyzed");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        analysisFailures.push({ changeId: change.id, error: message });
        await store.appendLlmLog({
          at: fetchedAt,
          changeId: change.id,
          status: "error",
          error: message,
        });
        log.warn({ changeId: change.id, err: message }, "analysis failed");
      }
    }
  }

  const result: DailyRunResult = {
    date,
    sourceRuns,
    changes,
    analyses,
    gatedOut,
    failures,
    analysisFailures,
    bootstrap: isBootstrap,
  };

  const markdown = generateDailyReportMarkdown({
    date,
    checkpointsHeading: config.display.checkpoints_heading,
    bootstrap: isBootstrap,
    result,
  });

  const reportPath = dailyReportPath(root, date);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  log.info({ reportPath, bootstrap: isBootstrap }, "daily report written");

  return result;
}
