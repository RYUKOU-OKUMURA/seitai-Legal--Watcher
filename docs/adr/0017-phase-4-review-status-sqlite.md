# Phase 4a の確認状態は SQLite の Analysis 単位で管理する

Phase 4a では `data/llm-log.jsonl` の最新 `Analysis` と対応する `data/raw/{changeId}.json` を `data/watch.db` に取り込み、確認状態を SQLite で管理する。`Analysis` には永続 ID がないため、`changeId`、`analyzedAt`、Analysis 本文フィールドから決定論的な `analysis_id` を生成する。同じ `changeId` に複数の Analysis が入った場合は、既存 Phase 3 と同じく最新を `is_latest = 1` として扱う。

確認状態は `review_statuses` に保存し、`new`、`reviewing`、`confirmed`、`action_required`、`expert_review_required`、`ignored`、`archived` を許可する。`needsExpertReview` が true の Analysis は初期状態を `expert_review_required` とし、それ以外は `new` とする。再 import は冪等で、既存の手動確認状態やメモを上書きしない。

Obsidian の frontmatter、Markdown のチェックボックス、手動メモは状態源にしない。確認状態の変更は Phase 4 以降のアプリまたは CLI から明示的に行う。

**Status**: accepted

**Considered Options**: `changeId` のみで状態管理 / Markdown チェックボックスを読み戻す / JSON state に追記する

**Consequences**: 再分析された同一 Change は新しい `analysis_id` として扱える。Phase 1〜3 の JSON/JSONL 生成は維持し、SQLite は Phase 4 の確認ワークフロー専用の読み書き層として開始する。
