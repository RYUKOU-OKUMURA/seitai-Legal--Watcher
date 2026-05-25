# Phase 1.0 パイロット監視先（enabled: true）

1.0 で `enabled: true` とする Watch Target は次の5件とする。URL は `packages/config/sources.yaml` に実装時に記載する。

| id | type | weight | 目的 |
|----|------|--------|------|
| `mhlw-news` | html | high | 厚労省報道発表 |
| `caa-press` | html | high | 消費者庁報道発表 |
| `egov-pubcomment` | html | medium | e-Gov パブリックコメント |
| `egov-law-api` | api | medium | e-Gov 法令 API（1.0 では disabled。HTML 応答のため） |
| `ncij-kokumin` | html | medium | 国民生活センター |

官報・地方厚生局・自治体・自院ソース・PDF 専用 URL は `enabled: false` で先行登録のみ。1.1 で PDF 等、1.2 で官報・自治体を有効化する（ADR-0009）。

**Status**: accepted

**Considered Options**: 最小3件 / Operator 独自指定（後から sources.yaml で差し替え可）
