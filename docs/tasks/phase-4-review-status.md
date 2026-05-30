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
