# AGENTS.md

## Project Overview

整体院・整骨院向けの公開法令・行政情報ウォッチャーです。GitHub Actions とローカル CLI で公式ソースを巡回し、差分・LLM 分析・日次 Markdown レポートを生成します。

## Tech Stack

- Node.js 22+
- pnpm 9+
- TypeScript monorepo
- Vitest
- GitHub Actions

## Project Structure

- `apps/agent/`: CLI, pipeline, report regeneration, source validation
- `packages/core/`: domain types, hashing, diff, rule gate
- `packages/config/`: YAML config loading and URL resolution
- `packages/fetchers/`: RSS/HTML/API/PDF fetchers
- `packages/llm/`: Cursor SDK analysis prompts and schema
- `packages/reports/`: daily Markdown report generation
- `packages/storage/`: JSON/JSONL state store

## Commands

- `pnpm run build`: build all packages
- `pnpm test`: build and run tests
- `pnpm lint`: TypeScript no-emit checks
- `pnpm validate-sources`: smoke test enabled source URLs
- `pnpm reset-state --clear-raw`: reset local state and raw snapshots before re-baseline
- `pnpm bootstrap`: create a local baseline without LLM analysis
- `pnpm daily`: production-equivalent daily run

## Important Notes

- Read `README.md`, `CONTEXT.md`, and `docs/adr/` before changing behavior.
- `reset-state` and `bootstrap` are local operational commands. Do not add destructive reset behavior to GitHub Actions unless explicitly requested.
- When source URLs, target keys, PDF extraction, or hash inputs change, plan a local `reset-state --clear-raw` followed by `bootstrap`.
- Commit in small, meaningful units. Do not batch unrelated implementation, docs, and generated state changes into one commit.
- After implementation, always ask a sub-agent to review the changes before finalizing.
- Do not revert user or generated changes unless the user explicitly asks.

