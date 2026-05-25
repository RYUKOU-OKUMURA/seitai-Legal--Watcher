# 週次レポートは Analysis 済み日次項目のみを集約する

Phase 3 週次の入力は、対象期間内の `Analysis`（ルールゲート通過かつ LLM 済み）の構造化 JSON のみとする。gated out の Detected Change は週次本文の主集計に含めない。週次 Cursor プロンプトで gated out を再送・再要約しない。

任意で週次末尾に「今週の未分析変化」付録を設け、当該週の gated out をタイトル・URL・ゲート理由の一覧のみ掲載してよい（LLM なし）。

**Status**: accepted

**Considered Options**: 全 Detected Change を週次で再処理 / 週次で gated out 再ゲート

**Consequences**: Phase 3 実装前に `llm-log.jsonl` または日次 export JSON から Analysis を期間抽出する集計器が必要。SQLite 導入時も ingest 対象は Analysis が正。
