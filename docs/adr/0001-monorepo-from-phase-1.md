# Phase 1 から pnpm monorepo で開始する

要件定義 §1.7 のルート直下 `src/` 単体構成は採用しない。技術スタック §3 に合わせ、Phase 1 から `apps/agent` と必要な `packages/*`（`core`, `fetchers`, `llm`, `reports`, `storage`, `config`）で実装する。`apps/desktop`（Tauri）は Phase 4 まで作らない。

フラット `src/` で MVP を早く出し、Phase 4 前に monorepo へ移行する案は、import パスと共有型の再配置コストが大きいため却下。Phase 1 で不要なパッケージ（例: `obsidian`）はフォルダごと先に作らない。

**Status**: accepted

**Considered Options**: ルート `src/` 単体 / Phase 4 前に移行 / ハイブリッド（`src/` のまま core のみ後抽出）

**Consequences**: 要件定義 §1.7 のディレクトリ図は技術スタック §3 に合わせて更新する。Detected Change 等の共有型は `packages/core` に置く。
