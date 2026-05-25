# 整体院・整骨院 Legal Watcher

公開法令・行政情報を監視し、差分検知と Cursor SDK による要約を日次 Markdown レポートとして出力するツールです。

## 設計ドキュメント

- [CONTEXT.md](CONTEXT.md) — 用語集
- [docs/adr/](docs/adr/) — アーキテクチャ決定記録
- [要件定義.md](要件定義.md) / [技術スタック.md](技術スタック.md) — 要件・技術概要

## 必要条件

- Node.js 22+
- pnpm 9+
- private GitHub repository（Actions で state / レポートを commit）
- `CURSOR_API_KEY`（日次 Analysis 生成時。ローカルモック時は不要）

## セットアップ

```bash
pnpm install
cp .env.example .env
# .env に CURSOR_API_KEY を設定
pnpm run build
```

## コマンド

```bash
# 本番同等（取得 → ゲート → LLM → レポート）
pnpm daily

# 取得・差分のみ
pnpm fetch

# モック LLM で E2E 確認（API キー不要）
pnpm --filter @seitai-legal-watch/agent daily --mock-llm
```

## Phase 1.0 スコープ

- **有効ソース**: `packages/config/sources.yaml` の `enabled: true`（5パイロット）
- **Fetcher**: rss / html / api
- **永続化**: `data/state.json`, `fetch-log.jsonl`, `llm-log.jsonl`, `data/raw/{changeId}.json`
- **レポート**: `reports/daily/YYYY-MM-DD.md`
- **通知**: なし（Phase 4）

### ロードマップ

| 版 | 内容 |
|----|------|
| 1.0 | rss/html/api + 5パイロット + Actions |
| 1.1 | PDF 抽出、追加公式ソース有効化 |
| 1.2 | 官報・自治体ソース有効化 |
| Phase 2 | Obsidian 同期 |
| Phase 3 | 週次レポート |
| Phase 4 | Tauri + 確認ステータス + 通知 |

## GitHub Actions

`.github/workflows/daily.yml` が JST 08:00（UTC 23:00）に実行します。

Secrets:

- `CURSOR_API_KEY`

手動実行: Actions タブ → Legal Watch Daily → Run workflow

## 受け入れ条件（Phase 1.0）

- [ ] GitHub Actions で `daily` が成功し `reports/daily/YYYY-MM-DD.md` が commit される
- [ ] `workflow_dispatch` で手動実行できる
- [ ] 有効 Watch Target の新規・更新を検知する
- [ ] 差分なし日は LLM を呼ばない
- [ ] ルールゲート不通過は「参考・未分析」節に載る
- [ ] レポートに原典 URL・重要度順・確認ポイントがある
- [ ] 取得失敗でもジョブ全体は完了する

## 設定

| ファイル | 用途 |
|----------|------|
| `packages/config/sources.yaml` | 監視 URL・重み・enabled |
| `packages/config/keywords.yaml` | ルールゲート用キーワード |
| `packages/config/display.yaml` | `operator_label`, 見出し |

## 開発

```bash
pnpm test
pnpm run build
```

## ライセンス

Private / 院内利用想定
