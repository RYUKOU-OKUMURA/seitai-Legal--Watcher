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

  if (alwaysAnalyze) {
    return { pass: true, reasons: ["always_analyze"] };
  }

  // high weight でも一覧の並び替え等で毎日 LLM が走るノイズを避けるため、
  // 無条件通過は alwaysAnalyze のみとし、キーワード一致を必須にする
  const haystack = `${change.title}\n${change.bodyExcerpt}\n${change.diffText ?? ""}`;
  const matches = countKeywordMatches(haystack, keywords);

  if (matches > 0) {
    return { pass: true, reasons: [`keyword_match:${matches}`] };
  }

  return { pass: false, reasons: [`${weight}_weight,no_keyword`] };
}
