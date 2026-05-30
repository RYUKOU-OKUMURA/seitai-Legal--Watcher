# Phase 4a タスク整理: 確認ステータス永続化

- **Status**: draft
- **Related ADR**: [ADR-0007: 確認ステータス（未確認／確認済み）は Phase 4 まで持たない](../adr/0007-no-confirmation-until-phase-4.md), [ADR-0017: Phase 4a の確認状態は SQLite の Analysis 単位で管理する](../adr/0017-phase-4-review-status-sqlite.md)

## ゴール

`data/llm-log.jsonl` の最新 `Analysis` と対応する `data/raw/{changeId}.json` を SQLite `data/watch.db` に取り込み、`changeId` / `analysis_id` 単位で確認ステータスを管理できるようにする。

Obsidian のチェックボックスや Markdown の編集内容は読み戻さない。確認状態は Phase 4 以降のアプリまたは CLI から明示的に保存する。

## 成果物

```text
data/watch.db
packages/storage/src/sqliteStateStore.ts
apps/agent/src/reviewStatus.ts
```

Node.js は `node:sqlite` を通常起動で使える `22.13.0` 以上を前提にする。

## CLI

```bash
pnpm review-import -- --date 2026-05-28
pnpm review-status -- --date 2026-05-28
pnpm review-confirm -- --change-id change-id --note "院内資料確認済み"
pnpm review-set-status -- --analysis-id analysis-id --status action_required
pnpm review-unconfirm -- --analysis-id analysis-id
```

## DB 方針

- `schema_migrations` で migration 適用済み version を管理する。
- `analyses` に最新 `Analysis` の構造化情報と raw snapshot メタデータを保存する。
- `review_statuses` に確認状態、確認日時、確認者、メモを保存する。
- `analysis_id` は `changeId`、`analyzedAt`、Analysis 本文フィールドから決定論的に生成する。
- 同一 `changeId` に新しい `analysis_id` が入った場合は、新しい行を `is_latest = 1`、古い行を `is_latest = 0` とする。
- 再 import は既存の `review_statuses` を上書きしない。

## ステータス

```text
new
reviewing
confirmed
action_required
expert_review_required
ignored
archived
```

`needsExpertReview: true` の Analysis は初期状態を `expert_review_required` とする。それ以外は `new` とする。

## 受け入れ条件

- `data/watch.db` が migration 付きで作成される。
- `llm-log.jsonl` から最新 `ok` Analysis を取り込める。
- 対応する raw snapshot がない Analysis は除外される。
- `--date YYYY-MM-DD` 指定時は raw snapshot の `detectedAt` を JST 日付で絞り込む。
- 同じデータを再 import しても重複しない。
- CLI で確認済み、未確認戻し、任意ステータス更新ができる。
- `changeId` 指定時は最新 Analysis の確認状態を更新できる。
- `analysis_id` 指定時は特定 Analysis の確認状態を更新できる。
- Obsidian の checkbox や Markdown の編集内容を状態として読み戻さない。
- 既存の daily / weekly / checklist / manual-impact / drafts 生成を壊さない。

## Phase 4b: 確認キュー Markdown

### ゴール

`data/watch.db` の `analyses` / `review_statuses` から、Operator が今日確認すべき項目を一覧化できるようにする。CLI と Markdown 出力で、未確認・対応要・専門家確認要を確認できる状態にする。

### 出力

```text
reports/review/YYYY-MM-DD_review_queue.md
```

frontmatter:

```yaml
---
type: legal-watch-review-queue
date: YYYY-MM-DD
target_count: 0
---
```

### 抽出条件

- `detected_date` が対象日と一致する。
- `is_latest = 1` の Analysis だけを対象にする。
- 通常キューに出す status:
  - `action_required`
  - `expert_review_required`
  - `reviewing`
  - `new`
- 通常キューから除外する status:
  - `confirmed`
  - `ignored`
  - `archived`

### 並び順

1. `action_required`
2. `expert_review_required`
3. `reviewing`
4. `new`
5. 同じ status 内では `importance` の `high`、`medium`、`low`
6. さらに同順位なら `needsExpertReview`、`detectedAt`

### CLI

```bash
pnpm review-queue -- --date 2026-05-28
```

`--date` 未指定時は `LEGAL_WATCH_TIMEZONE` または `Asia/Tokyo` の当日を使う。

### 受け入れ条件

- `pnpm review-queue -- --date YYYY-MM-DD` で `reports/review/YYYY-MM-DD_review_queue.md` が生成される。
- `analysisId`、`changeId`、現在 status、重要度、原典 URL、確認ポイントが出る。
- `confirmed` / `ignored` / `archived` は通常キューに出ない。
- `action_required` / `expert_review_required` が見落とされにくい順で出る。
- 対象がない日も「該当なし」が分かる Markdown が生成される。
- Markdown checkbox や Obsidian の編集内容を状態として読み戻さない。
