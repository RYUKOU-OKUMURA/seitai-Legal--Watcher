# Phase 1.0 パイロット監視先（enabled: true）

1.0 で `enabled: true` とする Watch Target は次の4件（Phase 1.0.1 時点）。URL は `packages/config/sources.yaml` に記載する。

| id | type | weight | URL（概要） |
|----|------|--------|-------------|
| `mhlw-news` | html | high | 厚労省月別報道一覧 `houdou_list_{YYYYMM}.html`（JST で展開） |
| `caa-press` | html | high | 消費者庁トップ `caa.go.jp/`（下位・RSS は 403 のため維持） |
| `egov-pubcomment` | html | medium | `public-comment.e-gov.go.jp/` + contentSelector |
| `ncij-kokumin` | html | medium | `kokusen.go.jp/`（EUC-JP デコード対応） |

| id | 備考 |
|----|------|
| `egov-law-api` | api、Phase 1.1 まで `enabled: false` |
| `mhlw-rss` | RSS URL 404 確認済み、`enabled: false` |

官報・地方厚生局・自治体・自院ソース・PDF 専用 URL は `enabled: false` で先行登録のみ。1.1 で PDF 等、1.2 で官報・自治体を有効化する（ADR-0009）。

**Status**: accepted

**Considered Options**: 最小3件 / Operator 独自指定（後から sources.yaml で差し替え可）
