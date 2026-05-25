# 監視設定は YAML 分割、URL は sources.yaml に明示列挙

`packages/config` に zod 検証付きの YAML を置く。`sources.yaml` が Watch Target の正（URL・種別・ソース重み・常時分析フラグ等）。`keywords.yaml` が監視キーワード。`display.yaml` が `operator_label` 等の表示設定。都道府県コード等は `regions.yaml` にメモ・グループ用として任意でよいが、Phase 1 では地域コードから自治体 URL を自動生成しない。自治体・保健所・地方厚生局の URL も `sources.yaml` に明示する（B-1）。

TypeScript へのハードコードや単一 `watch.yaml` は、運用時の差し替えしづらさのため採用しない。

**Status**: accepted

**Considered Options**: `sources.ts` ハードコード / 単一 watch.yaml / regions からの URL 自動生成（B-2）

**Consequences**: 要件定義の `src/config/sources.ts` は `packages/config` の YAML ローダーに置き換える。地域追加は YAML PR（または Actions 外での commit）で行う。
