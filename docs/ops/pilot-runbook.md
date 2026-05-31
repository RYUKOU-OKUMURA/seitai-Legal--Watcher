# Legal Watcher 試験運用 Runbook

## ゴール

試験運用の到達点は、日次で拾う、review queue で確認する、週次で事業判断に変換することです。

2〜4週間は現行の有効ソースをそのまま運用範囲として承認し、実データを見てからノイズを調整します。Tauri UI、通知、完全自動ダッシュボード、Obsidian 自動同期、監視ソースの大量追加は後回しです。

## 初期確認

GitHub Actions は `daily` のみを自動実行します。`reset-state` と `bootstrap` はローカル運用専用です。

```bash
pnpm validate-sources
gh secret list --repo RYUKOU-OKUMURA/seitai-Legal--Watcher
```

確認すること:

- `pnpm validate-sources` が成功する
- GitHub Secrets に `CURSOR_API_KEY` がある
- ローカル `.env` に `CURSOR_API_KEY` と `LEGAL_WATCH_TIMEZONE=Asia/Tokyo` がある
- Obsidian を使う場合だけ `LEGAL_WATCH_OBSIDIAN_VAULT_PATH` を設定する

ソース、target key、PDF 抽出、hash 入力を変えた場合だけ、次の順で再ベースラインします。

```bash
pnpm validate-sources
pnpm reset-state --clear-raw
pnpm bootstrap
```

## 日次運用

GitHub Actions またはローカルで日次レポートを生成します。

```bash
pnpm daily
```

確認対象は `reports/daily/YYYY-MM-DD.md` です。読む順番を固定します。

1. 分析済み更新
2. 分析済み更新内の `> 要専門家確認`
3. 分析済み更新内の確認ポイント
4. 取得失敗
5. 参考・未分析

原典を開くのは原則 `high` / `medium` の Analysis だけです。メモは次の観点に固定します。

- 広告・LP・SNS に関係するか
- 契約・回数券・返金・解約に関係するか
- 院内資料・マニュアルに関係するか
- LINE・ブログ・スタッフ共有などの発信ネタになるか

e-Gov の当日 404 や一時的な 403 は、試験運用中は既知ノイズとして扱います。

## 確認ステータス運用

確認状態の正は SQLite `data/watch.db` です。review queue は永続テーブルではなく、`data/watch.db` から都度生成する Markdown ビューです。Markdown のチェックボックスや Obsidian の編集内容は状態として読み戻しません。

日次レポートを確認する前に、その日の Analysis を取り込みます。

```bash
pnpm review-import -- --date YYYY-MM-DD
pnpm review-queue -- --date YYYY-MM-DD
```

確認対象は `reports/review/YYYY-MM-DD_review_queue.md` です。queue に表示される状態は `action_required`、`expert_review_required`、`reviewing`、`new` のみです。`confirmed`、`ignored`、`archived` は queue から外れます。

読んだものは確認済みにします。

```bash
pnpm review-confirm -- --change-id <change-id> --note "確認済み"
```

対応が必要なものは状態変更します。

```bash
pnpm review-set-status -- --analysis-id <analysis-id> --status action_required
pnpm review-set-status -- --analysis-id <analysis-id> --status expert_review_required
pnpm review-set-status -- --analysis-id <analysis-id> --status ignored
```

週末に `new` が溜まっていないか確認します。

```bash
pnpm review-status -- --status new
```

## 週次整理

毎週末または月曜朝に週次レポートを生成します。

```bash
pnpm weekly -- --week YYYY-Www
```

確認対象は `reports/weekly/YYYY-Www_legal_watch.md` です。週次レポートは Analysis 済み項目だけを主集計に使い、gated out は主集計に含めません。

週次で見る観点を固定します。

- 今週の重要更新
- 広告・LP・SNS への影響
- 契約・回数券・返金・解約への影響
- 院内資料・マニュアルへの影響
- 専門家に聞くべきこと
- 次週やること

必要な日だけ派生レポートを生成します。毎日は自動生成しません。

```bash
pnpm checklist -- --date YYYY-MM-DD
pnpm manual-impact -- --date YYYY-MM-DD
pnpm drafts -- --date YYYY-MM-DD
```

Obsidian に同期する場合、同期対象は daily / weekly / checklist / manual-impact / drafts です。日次同期では `Legal Watch/index.md` と high 重要度の topic note も更新されます。review queue は現状の同期対象ではありません。

```bash
pnpm obsidian-sync -- --date YYYY-MM-DD
pnpm obsidian-sync -- --weekly YYYY-Www
pnpm obsidian-sync -- --checklist YYYY-MM-DD
pnpm obsidian-sync -- --manual-impact YYYY-MM-DD
pnpm obsidian-sync -- --drafts YYYY-MM-DD
```

## ノイズ調整

2週間分の日次レポートを見てから、次を判断します。

- e-Gov API のノイズが多すぎないか
- 官報を毎日見る価値があるか
- 自治体ソースを増やすべきか
- 消費者庁トップだけで足りるか
- 厚労省療養費ページの PDF 追跡数を増やすべきか

ノイズが多い場合は `packages/config/keywords.yaml` と `packages/config/sources.yaml` を調整します。変更後は `pnpm validate-sources`、`pnpm reset-state --clear-raw`、`pnpm bootstrap` の順で再ベースラインします。
