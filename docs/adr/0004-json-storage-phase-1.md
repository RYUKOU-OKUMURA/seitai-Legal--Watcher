# Phase 1 の永続化は JSON/JSONL、SQLite は Phase 3 以降

Phase 1 では `JsonStateStore` のみ実装する。`packages/storage` に `StateStore` インターフェースを置き、Watch Target / Detected Change / Analysis の永続化は `data/state.json`、履歴は `fetch-log.jsonl`・`llm-log.jsonl`、原文は `data/raw/` とする。GitHub Actions 本番運用（ADR-0003）ではこれらを repo に commit する。

SQLite（`data/watch.db`）は Phase 3 週次集計・横断クエリ、または Phase 4 未確認管理の着手時に `SqliteStateStore` を追加する。Phase 1 から DB バイナリを commit する案は、マージ競合と監査 diff のしづらさのため却下。

**Status**: accepted

**Considered Options**: Phase 1 から SQLite / JSON と SQLite のデュアル書き

**Consequences**: Phase 1 受け入れ条件に SQLite は含めない。週次（Phase 3）設計時に ingest 方式（日次 JSONL → SQLite）を決める。
