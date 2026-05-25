import type { DetectedChange, GateResult, SourceWeight } from "./types.js";

export function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (kw && lower.includes(kw.toLowerCase())) count += 1;
  }
  return count;
}

export function ruleGate(
  change: DetectedChange,
  keywords: string[],
  weight: SourceWeight,
  alwaysAnalyze: boolean,
): GateResult {
  if (change.changeType === "failed") {
    return { pass: false, reasons: ["fetch_failure"] };
  }

  if (alwaysAnalyze || weight === "high") {
    return { pass: true, reasons: ["high_weight_or_always_analyze"] };
  }

  const haystack = `${change.title}\n${change.bodyExcerpt}\n${change.diffText ?? ""}`;
  const matches = countKeywordMatches(haystack, keywords);

  if (matches > 0) {
    return { pass: true, reasons: [`keyword_match:${matches}`] };
  }

  if (weight === "low") {
    return { pass: false, reasons: ["low_weight,no_keyword"] };
  }

  return { pass: false, reasons: ["medium_weight,no_keyword"] };
}
