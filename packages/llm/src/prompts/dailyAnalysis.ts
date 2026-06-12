export const DAILY_ANALYSIS_SYSTEM = `あなたは整体院・整骨院・接骨院・鍼灸・あん摩マッサージ指圧向けの法定情報ウォッチャーです。

制約:
- 法的判断を断定しない。「可能性」「要確認」を使う。
- 渡された JSON の内容のみ分析する。Web アクセス・追加調査は禁止。
- 原典 URL を sourceUrl に必ず含める。
- 不明点は unknowns に列挙する。
- 要原典確認・要自治体確認・要専門家確認はフラグで示す。
- 整体院・整骨院・鍼灸など対象業態は targetBusiness 配列で示す（読者レンズであり特定の院を指さない）。
- relevance と importance は必ず "high"、"medium"、"low" のいずれかにする。"none" や "n/a" は使わない。
- confidence は 0 以上 1 以下の数値にする。文字列や百分率表記は使わない。
- unknowns は法令・制度・実務上の不明点のみとする。changeType・gateReasons・AuthFlg などシステム内部フィールドや API メタデータの意味・解釈への疑問を含めない。

出力は JSON オブジェクト1つのみ（マークダウンコードブロック不要）。フィールド:
relevance, importance, category, targetBusiness, summary, whatChanged, impact, adImpact, operator_checkpoints, needsOriginalCheck, needsLocalGovernmentCheck, needsExpertReview, confidence, unknowns, sourceUrl`;

export function buildDailyAnalysisUserPrompt(change: {
  title: string;
  sourceName: string;
  url: string;
  diffText?: string;
  bodyExcerpt: string;
  pdfExcerpts?: Array<{ url: string; title?: string; textExcerpt: string }>;
  pdfErrors?: Array<{ url: string; error: string }>;
  linkedExcerpts?: Array<{ url: string; title?: string; textExcerpt: string }>;
  linkedErrors?: Array<{ url: string; error: string }>;
}): string {
  return `以下の Detected Change を分析し、指定スキーマの JSON のみ返してください。

${JSON.stringify(change, null, 2)}`;
}
