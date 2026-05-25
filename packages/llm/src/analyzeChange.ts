import { Agent } from "@cursor/sdk";
import type { Analysis, DetectedChange, GateResult } from "@seitai-legal-watch/core";
import { extractJsonObject } from "./extractJson.js";
import {
  buildDailyAnalysisUserPrompt,
  DAILY_ANALYSIS_SYSTEM,
} from "./prompts/dailyAnalysis.js";
import { analysisSchema } from "./schemas.js";

function mockAnalysis(change: DetectedChange): Analysis {
  return {
    changeId: change.id,
    relevance: "medium",
    importance: change.sourceWeight === "high" ? "high" : "medium",
    category: "要確認",
    targetBusiness: ["整体院", "整骨院"],
    summary: `${change.title} に変更がありました（モック分析）。原典をご確認ください。`,
    whatChanged: change.diffText?.slice(0, 500) ?? change.bodyExcerpt.slice(0, 300),
    impact: "実務影響の可能性があります。要原典確認。",
    adImpact: "広告・LP表現への影響の可能性があります。要確認。",
    operator_checkpoints: [
      "原典URLの内容を確認する",
      "自院のLP・SNS表現に影響がないか確認する",
    ],
    needsOriginalCheck: true,
    needsLocalGovernmentCheck: false,
    needsExpertReview: false,
    confidence: 0.5,
    unknowns: ["モック分析のため詳細は未判定"],
    sourceUrl: change.url,
    analyzedAt: new Date().toISOString(),
  };
}

export async function analyzeChange(
  change: DetectedChange,
  gate: GateResult,
  options?: { cwd?: string; apiKey?: string },
): Promise<Analysis> {
  if (process.env.LEGAL_WATCH_MOCK_LLM === "true") {
    return mockAnalysis(change);
  }

  const apiKey = options?.apiKey ?? process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }

  const userPrompt = buildDailyAnalysisUserPrompt({
    title: change.title,
    sourceName: change.sourceName,
    url: change.url,
    changeType: change.changeType,
    diffText: change.diffText,
    bodyExcerpt: change.bodyExcerpt,
    gateReasons: gate.reasons,
  });

  const fullPrompt = `${DAILY_ANALYSIS_SYSTEM}\n\n---\n\n${userPrompt}`;

  const result = await Agent.prompt(fullPrompt, {
    apiKey,
    model: { id: "composer-2.5" },
    local: {
      cwd: options?.cwd ?? process.cwd(),
      settingSources: [],
    },
  });

  const text =
    typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result ?? "");

  if (result.status === "error") {
    throw new Error(`Cursor agent run failed: ${text}`);
  }

  const parsed = analysisSchema.parse(extractJsonObject(text));

  return {
    changeId: change.id,
    ...parsed,
    analyzedAt: new Date().toISOString(),
  };
}
