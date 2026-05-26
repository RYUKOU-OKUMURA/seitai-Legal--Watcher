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

## 初回セットアップ（Phase 1.0.1）

初回は **ベースラインのみ** 確立し、LLM は呼びません。2回目以降の `daily` で差分のみ分析されます。

```bash
pnpm validate-sources   # enabled ソースが 200 か確認
pnpm reset-state        # 既存 state を消す（URL 変更後は必須）
pnpm bootstrap          # 取得 + state 更新 + ベースラインレポート（LLM なし）
pnpm daily              # 2回目以降：差分があれば LLM
```

`data/raw/` も消す場合:

```bash
pnpm reset-state --clear-raw
```

GitHub Actions の cron / 手動実行は `daily` のみです。`reset-state` と `bootstrap` はローカルで実行し、生成された `data/` と `reports/daily/` を commit してから Actions の手動 `daily` で確認します。

Phase 1.1 以降の URL・hash・PDF 抽出・監視対象変更を本番 state に反映する手順:

```bash
pnpm reset-state --clear-raw
pnpm bootstrap
git add data/ reports/daily/
git commit -m "chore: rebaseline legal watch state"
# push / PR / merge 後に Actions タブ → Legal Watch Daily → Run workflow
```

## コマンド

```bash
# 初回ベースライン（LLM スキップ）
pnpm bootstrap

# 本番同等（取得 → ゲート → LLM → レポート）
pnpm daily

# 取得・差分のみ
pnpm fetch

# data/raw と llm-log から日次レポートを再生成
pnpm report -- --date 2026-05-26

# state リセット（任意で raw 削除）
pnpm reset-state
pnpm reset-state --clear-raw

# enabled ソースの URL smoke test
pnpm validate-sources

# disabled 候補も含めた URL smoke test
pnpm validate-sources -- --include-disabled

# モック LLM で E2E 確認（API キー不要）
pnpm --filter @seitai-legal-watch/agent daily --mock-llm
```

## Phase 1.1 スコープ

- **有効ソース**: `packages/config/sources.yaml` の `enabled: true`（4パイロット + 療養費系 + e-Gov 更新法令）
- **Fetcher**: rss / html / api / pdf
- **PDF**: HTML 配下 PDF の抜粋追跡、PDF 単独 URL 監視、PDF 抽出失敗の記録
- **永続化**: `data/state.json`, `fetch-log.jsonl`, `llm-log.jsonl`, `data/raw/{changeId}.json`（PDF全文・バイナリは保存しない）
- **レポート**: `reports/daily/YYYY-MM-DD.md`
- **通知**: なし（Phase 4）

### ロードマップ

| 版 | 内容 |
|----|------|
| 1.0 | rss/html/api + 4パイロット + Actions |
| 1.1 | PDF 抽出、追加公式ソース有効化 |
| 1.2 | 官報・地方厚生局・自治体ソース有効化 |
| Phase 2 | Obsidian 同期 |
| Phase 3 | 週次レポート |
| Phase 4 | Tauri + 確認ステータス + 通知 |

## GitHub Actions

`.github/workflows/daily.yml` が JST 08:00（UTC 23:00）に実行します。
`.github/workflows/ci.yml` が push / pull request で build, test, lint を実行します。

Secrets:

- `CURSOR_API_KEY`

手動実行: Actions タブ → Legal Watch Daily → Run workflow（`daily` のみ。`bootstrap` はローカル実行）

## 受け入れ条件（Phase 1.0）

- [x] GitHub Actions で `daily` が成功し `reports/daily/YYYY-MM-DD.md` が commit される
- [x] `workflow_dispatch` で手動実行できる
- [x] 有効 Watch Target の新規・更新を検知する
- [x] 差分なし日は LLM を呼ばない
- [x] ルールゲート不通過は「参考・未分析」節に載る
- [x] レポートに原典 URL・重要度順・確認ポイントがある
- [x] 取得失敗でもジョブ全体は完了する

## 受け入れ条件（Phase 1.1）

- [x] HTML 配下 PDF の抜粋を差分・LLM 入力・レポートへ含められる
- [x] PDF 単独 URL を監視対象にできる
- [x] PDF 抽出失敗でジョブ全体を止めない
- [x] 療養費系ソースと e-Gov 更新法令 API を有効化する
- [x] push / pull request で build, test, lint を実行する

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
pnpm lint
```

## ライセンス

Private / 院内利用想定
