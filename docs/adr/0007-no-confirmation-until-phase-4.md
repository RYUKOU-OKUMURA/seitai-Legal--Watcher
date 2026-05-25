# 確認ステータス（未確認／確認済み）は Phase 4 まで持たない

Phase 1〜3 では Analysis や Detected Change に `confirmation_status` を保存しない。Operator の確認は Markdown / Obsidian 上の閲覧・手動メモに留める。レポート内の `- [ ]` 実務アクションは静的 Markdown とし、システムは読み取らない。

SQLite 導入時（Phase 4、`watch.db`）に `analysis_id`・`confirmed_at` 等で確認状態を管理する。Phase 2 の Obsidian frontmatter への `status` 付与も Phase 4 まで行わない（ADR の A に合わせる）。

**Status**: accepted

**Considered Options**: Phase 1 から state.json に保存 / Phase 2 から Obsidian frontmatter

**Consequences**: Phase 1 ダッシュボード要件はスコープ外。Phase 4 設計時に未確認件数の定義を `Analysis` 単位で行う。
