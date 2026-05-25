# Phase 1 の実行は GitHub Actions を正とする

日次監視の本番実行は private GitHub repository 上の GitHub Actions（JST 08:00 cron、`workflow_dispatch` 含む）とする。`state`・`raw`・`reports` は Actions 実行後に repo へ commit し、監査履歴とする。ローカルの `pnpm daily` は開発・検証・手動再実行用の同一コードパスとし、Phase 1 の受け入れ条件の正は Actions 側とする。

Mac mini 上での直接実行・Obsidian Vault 直書きは Phase 2 以降のオプション実行プロファイルとして追加する（要件定義 §2.3）。Phase 4 Tauri は Actions で蓄積した state / レポートのインポートも想定する。

**Status**: accepted

**Considered Options**: 最初から Mac ローカル主 / Actions とローカルを同等の本番二系統

**Consequences**: `.github/workflows/daily.yml` が Phase 1 の必須成果物。Secrets に `CURSOR_API_KEY`。ローカルは `.env` で同等実行可能にする。
