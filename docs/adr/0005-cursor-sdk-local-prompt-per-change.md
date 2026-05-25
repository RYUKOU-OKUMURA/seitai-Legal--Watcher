# Phase 1 の Cursor SDK は local + Agent.prompt（Change 単位）

GitHub Actions 上では、checkout した workspace を `local.cwd` とする `Agent.prompt` を、ルールゲート通過ごとの Detected Change につき1回呼ぶ。cloud runtime は Phase 1 では使わない。プロンプトには取得済みの構造化入力（タイトル・差分・抜粋等）のみ渡し、Web 巡回・追加取得・MCP は付けない。`settingSources` は空（インライン設定のみ）。

Cursor SDK の出力は JSON first とし、zod 検証後に Analysis として `llm-log.jsonl` に保存する。Markdown 日次レポートは全 Analysis 取得後に `packages/reports` が生成する（SDK に Markdown 丸投げしない）。1日1プロンプトへのバッチ化は Phase 2 以降の最適化候補。

**Status**: accepted

**Considered Options**: cloud + Change ごと / local + 日次バッチ1回

**Consequences**: `packages/llm` に `analyzeChange(change): Promise<Analysis>`。Actions のタイムアウト・並列数上限を workflow で調整。失敗時は当該 Change のみリトライ可能。
