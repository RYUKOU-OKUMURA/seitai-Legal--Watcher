# LLM プロンプトの正は packages/llm のみ（Phase 1）

Cursor SDK 向けのシステムプロンプト・ユーザプロンプトテンプレート・出力 JSON スキーマは `packages/llm` に集約する。GitHub Actions では `settingSources: []` のため `.cursor/skills/legal-watch-report` は読まれない。Phase 1 では当該 Skill は作らない（Phase 2 以降、IDE 手動分析用の薄いラッパを足す場合は `packages/llm` を参照する旨のみ記載可）。

`.cursor/rules/` はコーディング規約用とし、分析プロンプトの二重管理はしない。

**Status**: accepted

**Considered Options**: Skill と llm の二重管理 / Skill を正として CI が読む

**Consequences**: 技術スタックの `.cursor/skills/legal-watch-report/` は Phase 1 スコープ外。週次・チェックリストプロンプトも `packages/llm/prompts/` に追加する。
