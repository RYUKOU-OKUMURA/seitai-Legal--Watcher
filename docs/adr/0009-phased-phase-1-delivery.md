# Phase 1 は段階的出荷（1.0 → 1.1 → 1.2）

初回の GitHub Actions 成功は 1.0 とする。1.0 は `rss` + `html` fetcher、差分検知、ルールゲート、Change 単位の `Agent.prompt`、日次 Markdown、`sources.yaml` で少数パイロット URL のみ `enabled: true`。1.1 で PDF 抽出と残り公式ソースの有効化。1.2 で官報・地方厚生局・自治体（YAML 列挙分）を有効化する。

無効ソースも `sources.yaml` に `enabled: false` で先行登録してよい。受け入れ条件「監視対象 URL の新規・更新検知」は、**有効な Watch Target** に対して満たせばよい。要件定義の全 fetcher 一括実装を初回ブロッカーにはしない。

**Status**: accepted

**Considered Options**: 全ソース一括 / RSS 1本のみの極小パイロット

**Consequences**: fetcher 実装は種別ごとに PR を分割可能。README に 1.0/1.1/1.2 のチェックリストを記載する。
