# Phase 3 タスク整理: 週次の実務判断材料化

- **Status**: draft
- **Last updated**: 2026-05-27
- **Related ADR**: [ADR-0013: 週次レポートは Analysis 済み日次項目のみを集約する](../adr/0013-weekly-from-analysis-only.md)

## 目的

Phase 3 は、日次巡回で検出・分析した更新情報を、週次で実務判断に使える形へ変換するフェーズである。

日次レポートは「何が更新されたか」を素早く確認するための出力であり、Phase 3 の週次出力は「その更新をもとに、広告表現・院内資料・スタッフ共有・専門家確認へどうつなげるか」を整理する。

最初から全機能を入れると実装範囲が大きくなるため、まずは **Phase 3a: 週次レポートの最小実装** に絞る。

## 前提

- 週次集約の入力は `Analysis` 済み項目のみとする。
- `gated out` は主集計に含めない。
- 日次 Markdown を再解析せず、`data/llm-log.jsonl` の構造化データから集計する。
- LLM で未分析の Detected Change を、週次側で再分析しない。
- Phase 1〜3 では確認済みステータスを永続化しない。
- Obsidian 連携は Markdown ファイルの同期を基本とし、Obsidian API やプラグインには依存しない。

## 全体スコープ

Phase 3 は次の 5 段階に分ける。

| Phase | 内容 | 主な成果物 |
| --- | --- | --- |
| 3a | Analysis 集計器 + 週次 Markdown | `reports/weekly/YYYY-Www_legal_watch.md` |
| 3b | Obsidian weekly sync | `Legal Watch/weekly/YYYY-Www_legal_watch.md` |
| 3c | 広告・LP・SNSチェックリスト | `reports/checklists/YYYY-MM-DD_ad_checklist.md` |
| 3d | 院内マニュアル影響確認 | 週次レポート内の影響候補、または専用 Markdown |
| 3e | 転用文生成 | 院内共有メモ、スタッフ説明、SNS、ブログ、顧問確認メール |

## Phase 3a: 週次レポート最小実装

### ゴール

対象週の `Analysis` 済み項目を `data/llm-log.jsonl` から抽出し、重要更新・業態別影響・確認ポイント・原典一覧をまとめた週次 Markdown を生成する。

### 非ゴール

- 広告チェックリスト専用ファイルは生成しない。
- 院内マニュアル影響確認の専用ファイルは生成しない。
- SNS、ブログ、顧問メールなどの転用文は生成しない。
- gated out を LLM に再送しない。
- 日次 Markdown をパースしない。
- SQLite への移行は行わない。
- GitHub Actions の週次 workflow は 3a では必須にしない。

### 入力

主入力:

- `data/llm-log.jsonl`
- `data/raw/{changeId}.json`

抽出条件:

- `status: "ok"`
- `analysis` が存在する
- 対応する raw snapshot が存在する
- raw snapshot の `detectedAt` が対象週に含まれる

補助入力候補:

- `packages/config/display.yaml`
  - 確認ポイント見出しなど、既存の表示設定と整合させる。

日付判定:

- 対象週への所属は raw snapshot の `detectedAt` を JST へ変換して判定する。
- `analysis.analyzedAt` とログ行の `at` は、同じ `changeId` の複数ログから最新の Analysis を選ぶために使う。
- raw snapshot が見つからない Analysis は、stale なログ混入を避けるため 3a では除外する。
- 将来、日次 export JSON を追加する場合は、raw snapshot の代替入力として扱える。

除外するもの:

- `status: "error"` の LLM ログ
- `analysis` のないログ
- gated out の Detected Change
- fetch failure のみで Analysis がないもの
- 対応する raw snapshot がない Analysis

### 対象週の指定

CLI から ISO week を指定できるようにする。

```bash
pnpm weekly -- --week 2026-W22
```

推奨仕様:

- `--week YYYY-Www` を必須または明示指定の第一対応とする。
- 対象期間は JST 基準で月曜 00:00:00 から日曜 23:59:59 までとする。
- `--week` 未指定時のデフォルトは後続で決める。3a ではエラーにしてもよい。
- 将来の自動実行では「毎週月曜 JST 08:30 に前週分」を生成する。

検討メモ:

- dayjs の ISO week plugin を使うか、自前で `YYYY-Www` を JST 日付範囲へ変換する。
- 週番号の解釈は ISO week に寄せる。年跨ぎの `2026-W01` をテストする。

### 出力

GitHub 保存用:

```text
reports/weekly/YYYY-Www_legal_watch.md
```

例:

```text
reports/weekly/2026-W22_legal_watch.md
```

3a では Obsidian 同期は行わない。3b で同じ内容を以下へ同期する。

```text
Legal Watch/weekly/YYYY-Www_legal_watch.md
```

当初候補では 3a に Obsidian 同期も含めていたが、最初の実装単位を小さくするため 3b へ分離する。

### Markdown 構成

最小構成:

```md
# 整体院・整骨院 Legal Watch Weekly

対象期間: YYYY-MM-DD〜YYYY-MM-DD
対象週: YYYY-Www

## 1. 今週の重要更新
## 2. 業態別影響
### 2.1 整骨院・接骨院
### 2.2 整体院
### 2.3 鍼灸・あん摩マッサージ指圧
## 3. 広告・LP・SNSへの影響
## 4. 療養費・受領委任関連
## 5. 確認ポイント
## 6. 専門家確認候補
## 7. 原典一覧
```

空週の場合:

```md
## 1. 今週の重要更新

対象期間内に Analysis 済みの更新はありません。
```

### 集計ルール

重要更新:

- `importance: "high"` を優先して表示する。
- `importance: "high"` がない場合は `medium` まで表示する。
- 同じ重要度では `needsExpertReview`、`needsOriginalCheck`、`needsLocalGovernmentCheck` が true の項目を上位に置く。

業態別影響:

- `analysis.targetBusiness` をもとに分類する。
- 表記揺れがある場合は 3a では単純な文字列包含でよい。
- 未分類の項目は「その他・横断」にまとめる。

広告・LP・SNSへの影響:

- `analysis.adImpact` を影響メモとして扱う。
- `adImpact` は必須文字列のため、3a では原則として各 Analysis の内容を確認し、「該当なし」「影響なし」「特になし」など明示的に影響が薄い文言は下位または除外候補にする。
- 3a ではチェックリスト化せず、影響メモとして整理する。
- `治る`、`必ず改善`、`No.1`、`ビフォーアフター` などの固定観点は 3c で扱う。

療養費・受領委任関連:

- `category`、`summary`、`impact`、`operator_checkpoints` に療養費・受領委任・請求などが含まれる項目をまとめる。
- 3a では抽出ロジックを単純にし、過剰な推論はしない。

確認ポイント:

- 全 Analysis の `operator_checkpoints` を重複排除して表示する。
- 元 Analysis への参照として `changeId` または原典 URL を残す。

専門家確認候補:

- `needsExpertReview: true` の項目を列挙する。
- 断定調ではなく「確認候補」「要確認」として記載する。

原典一覧:

- `sourceUrl` を必ず表示する。
- raw snapshot から補完できる場合は title / sourceName / detectedAt も表示する。
- URL 重複はできるだけまとめるが、異なる Change なら `changeId` を残す。

### 表示トーン

- 法的断定をしない。
- 「違法」「合法」「問題ない」と言い切らない。
- 不明点は `unknowns` を使って「不明」「要原典確認」と書く。
- Operator が実務確認しやすい Markdown にする。
- Markdown チェックボックスは静的な TODO として扱い、システム状態とは連動させない。

### 実装候補

追加・変更候補:

- `packages/reports/src/weeklyReport.ts`
  - 週次 Markdown 生成ロジック
- `packages/reports/src/weeklyReport.test.ts`
  - Markdown 出力の単体テスト
- `apps/agent/src/weeklyFromLogs.ts`
  - `llm-log.jsonl` と raw snapshot から週次入力を組み立てる
- `apps/agent/src/cli.ts`
  - `weekly` command を追加
- `apps/agent/src/paths.ts`
  - `weeklyReportPath(root, week)` を追加
- `package.json`
  - `pnpm weekly` script を追加
- `apps/agent/package.json`
  - agent 側の `weekly` script を追加

既存設計との関係:

- 日次の `regenerateDailyReportFromLogs` と同じく、JSONL と raw snapshot から再生成できる形にする。
- Markdown 生成は `packages/reports` に置き、CLI から直接 Markdown 文字列を組み立てない。
- 週次 LLM プロンプトは 3a では追加しない。まずは既存 Analysis の決定論的集計にする。

### テスト観点

集計:

- `status: "ok"` かつ `analysis` ありだけが対象になる。
- `status: "error"` は除外される。
- 対象週外の Analysis は除外される。
- 同じ `changeId` のログが複数ある場合、最新の `ok` を採用する。
- 対象週判定は raw snapshot の `detectedAt` を使う。
- raw snapshot がない Analysis は除外される。
- `analysis.analyzedAt` がない場合の重複解決 fallback を明確にする。

週指定:

- `2026-W22` が正しい JST 日付範囲へ変換される。
- 年跨ぎの ISO week を扱える。
- 不正な `--week` はわかりやすいエラーになる。

Markdown:

- 重要更新、確認ポイント、専門家確認候補、原典一覧が出力される。
- 空週でも週次ファイルが生成される。
- 原典 URL が欠落しない。
- gated out が主集計に混ざらない。

CLI:

- `pnpm weekly -- --week 2026-W22` でファイルが生成される。
- 生成先ディレクトリがなければ作成される。
- 既存ファイルの上書き方針を決める。3a では上書き可でよい。

### 受け入れ条件

- `pnpm weekly -- --week 2026-W22` が実行できる。
- `reports/weekly/2026-W22_legal_watch.md` が生成される。
- 対象週の `Analysis` 済み項目だけが主集計に含まれる。
- gated out は主集計に含まれない。
- 日次 Markdown の解析に依存していない。
- 原典 URL が各項目または原典一覧に残る。
- Analysis がない週でも、空であることがわかる週次レポートを生成できる。
- `pnpm test` と `pnpm lint` が通る。

## Phase 3b: Obsidian weekly sync

### ゴール

3a で生成した週次 Markdown を Obsidian Vault の `Legal Watch/weekly/` に同期する。

### 入力

- `reports/weekly/YYYY-Www_legal_watch.md`
- 既存の Obsidian Vault 設定

### 出力

```text
Obsidian Vault/Legal Watch/weekly/YYYY-Www_legal_watch.md
```

### 実装方針

- 既存の `syncDailyReportToObsidian` と同じ Vault 設定・skip/force 方針で、週次用 sync 関数を追加する。
- daily 専用ロジックと共通化できる箇所は共通化する。
- Obsidian 用 frontmatter とタグは、GitHub 保存用 Markdown と矛盾しない範囲で付与する。
- `index.md` に `最近の週次レポート` セクションを追加し、週次レポートへの導線を作る。

### CLI

```bash
pnpm obsidian-sync -- --weekly 2026-W22
```

`pnpm weekly -- --week 2026-W22` は生成のみを維持し、Obsidian 同期は既存の `obsidian-sync` コマンドへ集約する。

### 受け入れ条件

- Obsidian 側の weekly directory がなければ作成される。
- 既存ファイルがある場合は、既存の日次同期と同じ上書き方針に従う。
- GitHub 保存用と Obsidian 保存用の本文が矛盾しない。
- Obsidian 同期なしでも weekly 生成は単独で使える。
- `Legal Watch/index.md` から最近の週次レポートへ辿れる。

## Phase 3c: 広告・LP・SNSチェックリスト

### ゴール

広告表現に影響しそうな Analysis を抽出し、実務で確認するためのチェックリスト Markdown を生成する。

### 出力

```text
reports/checklists/YYYY-MM-DD_ad_checklist.md
Obsidian Vault/Legal Watch/checklists/YYYY-MM-DD_ad_checklist.md
```

### 抽出候補

- `analysis.adImpact` に具体的な影響がある
- `category` が広告、表示、消費者庁、景品表示、医療広告、健康被害などに近い
- `operator_checkpoints` に LP、広告、SNS、口コミ、No.1、ビフォーアフター等が含まれる

### 固定確認観点

- 「治る」と断定していないか
- 「必ず改善」と保証していないか
- 医療機関と誤認される表現がないか
- 国家資格の有無を誤認させていないか
- ビフォーアフターが過度な効果保証に見えないか
- 口コミ表示に不自然な誘導がないか
- No.1 表示の根拠が明確か
- 期間限定・割引表示に誤認がないか

### 受け入れ条件

- 関連更新がある場合だけチェックリストを生成する、または「該当なし」を明示する方針を決める。
- 固定確認観点と、更新由来の確認観点が分かれている。
- 法的断定や安全保証の表現が含まれない。

## Phase 3d: 院内マニュアル影響確認

### ゴール

Analysis から、院内資料・スタッフ説明・運用フローに影響しそうな候補を抽出する。

### 確認対象

- 受付説明
- 施術メニュー表記
- 問診票
- 同意書
- 療養費請求フロー
- スタッフ説明文
- LP掲載文
- SNS投稿ルール
- 返金・解約説明
- 施術リスク説明

### 出力案

候補 A:

- 週次レポート内に「院内マニュアル影響候補」セクションを追加する。

候補 B:

- 専用ファイルを生成する。

```text
reports/manual-impact/YYYY-MM-DD_manual_impact.md
```

3d 開始時点で、週次レポート内に収めるか専用ファイルに分けるかを決める。

## Phase 3e: 転用文生成

### ゴール

週次レポートの内容を、実務コミュニケーションに転用しやすい下書きへ変換する。

### 生成候補

- 院内共有メモ
- スタッフ向け説明
- SNS投稿下書き
- ブログ下書き
- 顧問に送る確認メール下書き

### 制約

- 法的判断を断定しない。
- 「当院は法律上問題ありません」などの保証表現を避ける。
- 一般読者向け投稿では不安を煽らない。
- 原典確認前の内容は「確認中」「可能性」「要確認」と明記する。
- 顧問向けメールでは、判断を求める論点と原典 URL を明確にする。

## 実装順序案

1. `llm-log.jsonl` から Analysis を週範囲で抽出する関数を作る。
2. 週指定 `YYYY-Www` を JST 日付範囲に変換する関数を作る。
3. `packages/reports` に週次 Markdown generator を追加する。
4. `apps/agent` に `weekly` CLI を追加する。
5. root / agent の `package.json` に `weekly` script を追加する。
6. fixtures を使った単体テストを追加する。
7. `pnpm weekly -- --week 2026-W22` で実データから生成確認する。
8. 生成結果を見て、Markdown セクションの過不足を調整する。
9. 3b で Obsidian weekly sync を追加する。
10. 3c 以降でチェックリスト・院内影響・転用文へ拡張する。

## PR 分割案

PR 1:

- Phase 3a の週次集計器、週次 Markdown、CLI、テスト。

PR 2:

- Phase 3b の Obsidian weekly sync。

PR 3:

- Phase 3c の広告チェックリスト生成。

PR 4:

- Phase 3d の院内マニュアル影響確認。

PR 5:

- Phase 3e の転用文生成。

## 未決事項

- `--week` 未指定時に前週をデフォルト生成するか。
- 週次レポートで raw snapshot を必須補完として読むか、Analysis のみで完結させるか。
- 同じ `changeId` に複数の `ok` Analysis がある場合の採用ルール。
- gated out を付録一覧として出すか。ADR 上は任意だが、3a では主集計から除外することを優先する。
- 週次レポートで LLM に統合要約させるタイミング。3a は決定論的集計、3c 以降で JSON first の週次 LLM を検討する。
- Obsidian weekly の frontmatter / tag 設計。
- GitHub Actions の weekly workflow を 3a で入れるか、3b 以降に回すか。

## 完了の定義

Phase 3a 完了時点:

- ローカル CLI で任意週の週次 Markdown を再生成できる。
- 週次の主集計が Analysis 済み項目だけに限定されている。
- gated out を主集計に入れないことがテストで保証されている。
- 日次 Markdown の構造変更に週次生成が影響されない。
- 後続の Obsidian 同期、広告チェックリスト、転用文生成へ拡張しやすいモジュール境界になっている。

Phase 3 全体完了時点:

- 週次レポートが生成される。
- Obsidian 側にも weekly が同期される。
- 広告・LP・SNSチェックリストが生成される。
- 院内マニュアル影響候補が確認できる。
- 院内共有・スタッフ説明・SNS・ブログ・顧問確認メールへ転用できる下書きが生成される。
- 生成文に法的断定や安全保証が含まれない。
