# 初回実行は bootstrap コマンドでベースラインのみ確立する

Phase 1 初回は state が空のため、ほぼすべての監視対象が `new` となり、高重みソースではルールゲートを通過して LLM が一括実行される。これを避けるため `legal-watch bootstrap` を追加する。fetch と state 更新・raw 保存は行うが LLM は常にスキップし、レポートは「初回ベースライン」形式とする。2回目以降の `daily` で差分のみ LLM 分析する。

**Status**: accepted

**Consequences**: GitHub Actions cron は `daily` のまま。初回デプロイ前は README 手順でローカル `bootstrap` を推奨。`llm-log.jsonl` は bootstrap では追記しない。
