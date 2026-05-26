import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "@seitai-legal-watch/config";
import type { Analysis, DailyRunResult, DetectedChange } from "@seitai-legal-watch/core";
import { ruleGate } from "@seitai-legal-watch/core";
import { runFetchCycle } from "@seitai-legal-watch/fetchers";
import { analyzeChange } from "@seitai-legal-watch/llm";
import { generateDailyReportMarkdown } from "@seitai-legal-watch/reports";
import { JsonStateStore } from "@seitai-legal-watch/storage";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import type { Logger } from "pino";
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
  if (!options.reportOnly) {
    log.info({ sources: config.enabledSources.length, bootstrap: isBootstrap }, "fetch cycle start");
    changes = await runFetchCycle(
      config.enabledSources,
      store,
      fetchedAt,
      date,
    );
    log.info({ changes: changes.length }, "fetch cycle done");
  }

  const gatedOut: DetectedChange[] = [];
  const toAnalyze: DetectedChange[] = [];
  const failures = changes.filter((c) => c.changeType === "failed");

  for (const change of changes) {
    if (change.changeType === "failed") continue;
    const source = config.enabledSources.find((s) => s.id === change.sourceId);
    const gate = ruleGate(
      change,
      config.keywords,
      change.sourceWeight,
      source?.alwaysAnalyze ?? false,
    );
    change.gatePass = gate.pass;
    change.gateReasons = gate.reasons;
    if (!isBootstrap && gate.pass) toAnalyze.push(change);
    else if (!gate.pass) gatedOut.push(change);
    else if (isBootstrap) {
      change.gateReasons = [...(change.gateReasons ?? []), "bootstrap_skip_llm"];
    }
  }

  const analyses: Analysis[] = [];
  const analysisFailures: { changeId: string; error: string }[] = [];

  const runLlm = !options.skipLlm && !options.reportOnly && !isBootstrap;

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
