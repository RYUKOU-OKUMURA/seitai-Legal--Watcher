# data/raw は Detected Change 時のみ抜粋 JSON を commit

毎回の Fetch Snapshot 全文（HTML/PDF バイナリ）は Git に commit しない。通常巡回は `state.json` のハッシュ更新と `fetch-log.jsonl` で足りる。Detected Change 発生時のみ `data/raw/{change_id}.json` に URL・取得日時・タイトル・本文抜粋（上限文字数）・PDF 抜粋・リンク差分・ハッシュ等のメタデータを保存し commit する。原典の再取得は原典 URL に依拠する。

全文 HTML の毎日 commit（案 A）と Artifacts のみ（案 C）は、repo 肥大化または監査の弱さのため採用しない。高重要度のみ全文保存は Phase 2 以降の拡張候補。

**Status**: accepted

**Considered Options**: 毎回全文 commit / Artifacts のみ

**Consequences**: `packages/core` に抜粋上限定数。fetcher は Change 検知後に excerpt 生成。LLM 入力も同じ抜粋を使う。
