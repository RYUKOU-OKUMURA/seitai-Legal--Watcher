# Phase 3 タスク整理: 週次の実務判断材料化

- **Status**: draft
- **Last updated**: 2026-05-30
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
| 3d | 院内マニュアル影響確認 | `reports/manual-impact/YYYY-MM-DD_manual_impact.md` |
| 3e | 転用文生成 | `reports/drafts/YYYY-MM-DD_practical_drafts.md` |

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

対象日の `Analysis` 済み項目から広告・LP・SNS表現に影響しそうな項目を抽出し、実務で確認するためのチェックリスト Markdown を生成する。

チェックボックスは静的 Markdown とし、Phase 4 まで確認済み状態として永続化しない。

### 入力

- `data/llm-log.jsonl`
- `data/raw/{changeId}.json`

抽出条件:

- `status: "ok"` かつ `analysis` が存在する。
- 対応する raw snapshot が存在する。
- raw snapshot の `detectedAt` を JST へ変換した日付が対象日と一致する。
- 同じ `changeId` に複数の `ok` Analysis がある場合は、既存週次と同じく最新を採用する。

除外するもの:

- `status: "error"` の LLM ログ
- `analysis` のないログ
- gated out の Detected Change
- 対応する raw snapshot がない Analysis
- 対象日外の Analysis

### 出力

```text
reports/checklists/YYYY-MM-DD_ad_checklist.md
Obsidian Vault/Legal Watch/checklists/YYYY-MM-DD_ad_checklist.md
```

対象がない日も「該当なし」が分かるチェックリストファイルを生成する。

### CLI

```bash
pnpm checklist -- --date 2026-05-28
pnpm obsidian-sync -- --checklist 2026-05-28
```

Obsidian 同期は既存 daily / weekly と同じ Vault 設定・skip/force 方針に従う。

### 抽出候補

- `analysis.adImpact` に具体的な影響がある
- `category` が広告、表示、消費者庁、景品表示、医療広告、健康被害などに近い
- `summary`、`impact`、`operator_checkpoints` に LP、広告、SNS、口コミ、No.1、ビフォーアフター等が含まれる
- `analysis.adImpact` が「該当なし」「影響なし」「特になし」など低影響文言だけの場合は、他の広告シグナルがない限り対象外にする

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

- `pnpm checklist -- --date YYYY-MM-DD` で `reports/checklists/YYYY-MM-DD_ad_checklist.md` が生成される。
- 対象がない日も「該当なし」が分かるチェックリストが生成される。
- 原典 URL、changeId、広告・LP・SNSへの影響、更新由来の確認項目が出力される。
- 固定確認観点と、更新由来の確認観点が分かれている。
- `pnpm obsidian-sync -- --checklist YYYY-MM-DD` で `Legal Watch/checklists/YYYY-MM-DD_ad_checklist.md` に同期できる。
- 既存 Obsidian ファイルは `--force` なしでは上書きされない。
- `Legal Watch/index.md` から最近の広告チェックリストへ辿れる。
- Markdown チェックボックスを確認状態として読み戻さない。
- 法的断定や安全保証の表現が含まれない。

## Phase 3d: 院内マニュアル影響確認

### ゴール

対象日の `Analysis` 済み項目から、院内資料・スタッフ説明・受付対応・問診票・同意書・料金表・療養費請求フローなど、院内運用資料の確認につながりそうな候補を抽出し、実務確認用 Markdown を生成する。

Phase 3c と同じく、チェックボックスは静的 Markdown として出力する。Phase 4 までは確認済み状態を永続化せず、Obsidian 側のチェック状態もシステムへ読み戻さない。

3d の出力単位は **日次専用ファイル** とする。週次レポートへ混ぜず、対象日ごとの確認作業を Obsidian で扱いやすくする。

### 非ゴール

- 院内資料・同意書・問診票そのものの自動改訂
- 患者向け説明文やスタッフ向け台本の確定版生成
- 法的適合性の断定、または「問題なし」の保証
- 確認済み / 未確認ステータスの保存
- Markdown チェックボックスや Obsidian frontmatter を状態として読み戻すこと

### 確認対象

- 受付説明
- 施術メニュー表記
- 問診票
- 同意書
- 療養費請求フロー
- スタッフ説明文
- 院内掲示・配布資料
- 料金表・割引説明
- 返金・解約説明
- 施術リスク説明
- 禁忌・注意事項
- 個人情報・記録管理の案内

LP / SNS だけに閉じる表示確認は Phase 3c の広告チェックリストを正とする。3d では、LP / SNS から院内説明・受付対応・スタッフ運用へ波及するものだけを対象に含める。

### 入力

- `data/llm-log.jsonl`
- `data/raw/{changeId}.json`

抽出前の共通条件:

- `status: "ok"` かつ `analysis` が存在する。
- 対応する raw snapshot が存在する。
- raw snapshot の `detectedAt` を JST へ変換した日付が対象日と一致する。
- 同じ `changeId` に複数の `ok` Analysis がある場合は、既存週次・3c と同じく最新を採用する。

除外するもの:

- `status: "error"` の LLM ログ
- `analysis` のないログ
- gated out の Detected Change
- 対応する raw snapshot がない Analysis
- 対象日外の Analysis
- 広告・LP・SNS 表示だけに閉じ、院内資料・受付対応・スタッフ説明・請求フローへの波及語がないもの

### 抽出条件

`analysis.category`、`analysis.summary`、`analysis.impact`、`analysis.operator_checkpoints`、必要に応じて `analysis.whatChanged` を対象に、院内運用への影響候補を判定する。

強い抽出キーワード:

- `院内資料`, `院内マニュアル`, `マニュアル`, `手順`, `運用`, `フロー`
- `スタッフ`, `職員`, `研修`, `説明文`, `共有`, `受付`, `窓口`, `患者説明`
- `問診`, `問診票`, `同意書`, `説明同意`, `リスク説明`, `禁忌`, `注意事項`
- `料金表`, `料金`, `費用`, `返金`, `解約`, `キャンセル`, `割引`
- `療養費`, `受領委任`, `保険請求`, `請求`, `支給申請`, `柔道整復`
- `施術メニュー`, `メニュー表記`, `院内掲示`, `配布資料`, `個人情報`, `記録管理`

弱い抽出キーワード:

- `説明`, `案内`, `確認`, `表示`, `見直し`, `変更`, `更新`

弱いキーワードは単独では抽出理由にしない。強いキーワード、または `受付` / `スタッフ` / `患者` / `料金` / `同意` / `問診` / `療養費` など具体的な対象語と同じ文脈にある場合だけ抽出理由にする。

抽出理由は Markdown に表示する。例:

- `category`
- `impact`
- `operator_checkpoints`
- `summary`
- `whatChanged`

### 出力

```text
reports/manual-impact/YYYY-MM-DD_manual_impact.md
Obsidian Vault/Legal Watch/manual-impact/YYYY-MM-DD_manual_impact.md
```

対象がない日も「該当なし」が分かる Markdown ファイルを生成する。

frontmatter:

```yaml
---
type: legal-watch-manual-impact
date: YYYY-MM-DD
target_count: 0
---
```

本文構成:

1. `# 院内マニュアル影響確認`
2. 対象日
3. `## 1. 対象更新`
   - 対象なしの場合は「対象日に院内マニュアル影響確認へ紐づく Analysis はありません。」
   - 対象ありの場合は重要度順、専門家確認要否、原典確認要否、検出時刻順で並べる。
4. 各対象更新に出す項目
   - 情報源
   - 原典 URL
   - `changeId`
   - `detectedAt`
   - カテゴリ
   - 対象業態
   - 抽出理由
   - 確認対象分類
   - 更新概要
   - 実務影響（要確認）
   - 更新由来の確認項目
   - 固定確認観点
   - 不明点
5. `## 2. 原典一覧`
6. 自動生成・非断定の注記

固定確認観点:

- [ ] 該当する院内資料・マニュアル・掲示物を洗い出す
- [ ] 受付説明やスタッフ説明の現行文言と原典を照合する
- [ ] 問診票・同意書・リスク説明への反映要否を確認する
- [ ] 料金表・返金・解約説明への反映要否を確認する
- [ ] 療養費・受領委任・請求フローへの反映要否を確認する
- [ ] 変更する場合の院内共有日・適用開始日を決める
- [ ] 専門家確認が必要な論点を切り分ける

### CLI

```bash
pnpm manual-impact -- --date 2026-05-28
pnpm obsidian-sync -- --manual-impact 2026-05-28
pnpm obsidian-sync -- --manual-impact 2026-05-28 --force
```

Obsidian 同期は既存 daily / weekly / checklist と同じ Vault 設定・skip/force 方針に従う。

### 実装タスク

1. Phase 3d のタスク定義を確定する。
   - 日次専用ファイルを採用する。
   - 週次レポートへの混在はスコープ外にする。
   - 確認状態を永続化しない方針を ADR-0007 と整合させる。

2. `packages/reports` に manual impact Markdown generator を追加する。
   - `packages/reports/src/manualImpactReport.ts`
   - `packages/reports/src/manualImpactReport.test.ts`
   - `packages/reports/src/index.ts` から export
   - 空日、対象あり、重複チェックポイント、不明点、非断定フッターをテストする。

3. `apps/agent` に Analysis 収集器を追加する。
   - `apps/agent/src/manualImpactFromLogs.ts`
   - 既存の `loadLatestAnalysesByChangeId` と `loadRawSnapshots` を使う。
   - raw snapshot の `detectedAt` を JST 日付で判定する。
   - raw 欠落、対象日外、error ログ、analysis なしを除外する。
   - `selectionReasons` と `manualReviewAreas` を返す。

4. 院内影響候補の判定ロジックを実装する。
   - 強いキーワードは単独で候補化できる。
   - 弱いキーワードは具体的な院内対象語と同時に出た場合のみ候補化する。
   - `adImpact` だけでは候補化しない。ただし本文側に院内対象語があれば 3d にも含める。
   - `isManualImpactTarget(analysis)` を unit test 可能にする。

5. report path と CLI を追加する。
   - `apps/agent/src/paths.ts` に `manualImpactReportPath(root, date)` を追加する。
   - `apps/agent/src/cli.ts` に `manual-impact` command を追加する。
   - root `package.json` に `manual-impact` script を追加する。
   - `apps/agent/package.json` に `manual-impact` script を追加する。

6. Obsidian 同期を追加する。
   - `ObsidianManualImpactSyncOptions` / `ObsidianManualImpactSyncResult` を追加する。
   - `readManualImpactReport` を追加する。
   - `enrichManualImpactMarkdownForObsidian` を追加し、`legal-watch`、`法令監視`、`院内影響確認` タグを付与する。
   - `manualImpactDirPath(vaultPath)` は `Legal Watch/manual-impact` にする。
   - `syncManualImpactReportToObsidian` を追加する。
   - `sync-obsidian` CLI に `--manual-impact <YYYY-MM-DD>` を追加し、`--date` / `--weekly` / `--checklist` と排他にする。

7. `Legal Watch/index.md` に導線を追加する。
   - `最近の院内影響確認` セクションを追加する。
   - `manual-impact/YYYY-MM-DD_manual_impact.md` を新しい日付順に表示する。
   - `target_count` を表示する。
   - 既存の日次・週次・広告チェックリスト・重要度高トピックの導線を壊さない。

8. テストを追加する。
   - 抽出対象: 問診票、同意書、受付説明、料金表、療養費請求フロー、スタッフ説明
   - 対象外: 広告だけ、汎用的な「表示」「説明」だけ、対象日外
   - JST 日付境界: raw snapshot の `detectedAt` を `Asia/Tokyo` に変換して対象日を判定する
   - 空日: `target_count: 0` と「該当なし」文言
   - 最新 Analysis 採用: 同一 `changeId` は `analyzedAt` / log 行順で最新を使う
   - raw 欠落除外
   - malformed date 拒否
   - Obsidian sync: 新規作成、skip、force、Vault 未設定、元ファイル欠落
   - Obsidian enrichment: tag 付与、既存 tag の重複排除、状態 frontmatter を付けない
   - index 反映: `最近の院内影響確認` のソートと件数

9. ドキュメントを更新する。
   - README の command 例に `manual-impact` と `obsidian-sync -- --manual-impact` を追加する。
   - README のレポート一覧に `reports/manual-impact/YYYY-MM-DD_manual_impact.md` を追加する。
   - Phase 3 表に 3d の成果物を追記する。

10. 検証する。
    - `pnpm run build`
    - `pnpm test`
    - `pnpm lint`
    - temp vault を使った `pnpm obsidian-sync -- --manual-impact YYYY-MM-DD` の skip / force 確認
    - 実装後、サブエージェントに変更レビューを依頼し、指摘を反映または理由付きで却下する。

### 受け入れ条件

- `pnpm manual-impact -- --date YYYY-MM-DD` で `reports/manual-impact/YYYY-MM-DD_manual_impact.md` が生成される。
- 原典 URL、`changeId`、影響内容、確認対象分類、抽出理由、チェック項目が出力される。
- 対象がない日も「該当なし」が分かる Markdown が生成される。
- `pnpm obsidian-sync -- --manual-impact YYYY-MM-DD` で `Legal Watch/manual-impact/YYYY-MM-DD_manual_impact.md` に同期できる。
- 既存 Obsidian ファイルは `--force` なしでは上書きされない。
- `Legal Watch/index.md` から最近の院内影響確認へ辿れる。
- 法的断定や「問題なし」保証をしない。
- チェックボックスを確認状態として読み戻さない。
- 日次・週次・広告チェックリストの既存出力と CLI を壊さない。

## Phase 3e: 転用文生成

### ゴール

対象日の `Analysis` 済み項目を `data/llm-log.jsonl` と `data/raw/{changeId}.json` から抽出し、院内共有・スタッフ説明・顧問確認メール・SNS/ブログ向け控えめ文案へ転用しやすい下書き Markdown を生成する。

下書きは法的判断ではなく、原典確認中の実務コミュニケーション素材として扱う。公開・配布・送信前に原典確認、院内運用との照合、必要に応じた専門家確認を行う前提にする。

### 入力

- `data/llm-log.jsonl`
- `data/raw/{changeId}.json`
- Phase 3c / 3d の出力は必須入力にしない。必要な情報は `Analysis` と raw snapshot から決定論的に生成する。

抽出条件:

- `status: "ok"` かつ `analysis` が存在する。
- 対応する raw snapshot が存在する。
- raw snapshot の `detectedAt` を JST へ変換した日付が対象日と一致する。
- 同じ `changeId` に複数の `ok` Analysis がある場合は、既存週次・3c・3d と同じく最新を採用する。

除外するもの:

- `status: "error"` の LLM ログ
- `analysis` のないログ
- gated out の Detected Change
- 対応する raw snapshot がない Analysis
- 対象日外の Analysis

### 出力

```text
reports/drafts/YYYY-MM-DD_practical_drafts.md
Obsidian Vault/Legal Watch/drafts/YYYY-MM-DD_practical_drafts.md
```

対象がない日も「該当なし」が分かる Markdown ファイルを生成する。

frontmatter:

```yaml
---
type: legal-watch-practical-drafts
date: YYYY-MM-DD
target_count: 0
---
```

### 生成候補

- 院内共有メモ
- スタッフ向け説明
- SNS投稿下書き
- ブログ下書き
- 顧問に送る確認メール下書き

### CLI

```bash
pnpm drafts -- --date 2026-05-28
pnpm obsidian-sync -- --drafts 2026-05-28
pnpm obsidian-sync -- --drafts 2026-05-28 --force
```

Obsidian 同期は既存 daily / weekly / checklist / manual-impact と同じ Vault 設定・skip/force 方針に従う。

### 制約

- 法的判断を断定しない。
- 「当院は法律上問題ありません」などの保証表現を避ける。
- 一般読者向け投稿では不安を煽らない。
- 原典確認前の内容は「確認中」「可能性」「要確認」と明記する。
- 顧問向けメールでは、判断を求める論点と原典 URL を明確にする。

### 実装タスク

1. `packages/reports` に practical drafts Markdown generator を追加する。
   - `packages/reports/src/practicalDraftReport.ts`
   - `packages/reports/src/practicalDraftReport.test.ts`
   - `packages/reports/src/index.ts` から export

2. `apps/agent` に Analysis 収集器を追加する。
   - `apps/agent/src/draftsFromLogs.ts`
   - 既存の `loadLatestAnalysesByChangeId` と `loadRawSnapshots` を使う。
   - raw snapshot の `detectedAt` を JST 日付で判定する。
   - raw 欠落、対象日外、error ログ、analysis なしを除外する。

3. report path と CLI を追加する。
   - `apps/agent/src/paths.ts` に `practicalDraftReportPath(root, date)` を追加する。
   - `apps/agent/src/cli.ts` に `drafts` command を追加する。
   - root / agent の `package.json` に `drafts` script を追加する。

4. Obsidian 同期を追加する。
   - `ObsidianDraftsSyncOptions` / `ObsidianDraftsSyncResult` を追加する。
   - `readDraftsReport` を追加する。
   - `enrichDraftsMarkdownForObsidian` を追加し、`legal-watch`、`法令監視`、`転用下書き` タグを付与する。
   - `draftsDirPath(vaultPath)` は `Legal Watch/drafts` にする。
   - `syncDraftsReportToObsidian` を追加する。
   - `sync-obsidian` CLI に `--drafts <YYYY-MM-DD>` を追加し、既存オプションと排他にする。

5. `Legal Watch/index.md` に導線を追加する。
   - `最近の転用下書き` セクションを追加する。
   - `drafts/YYYY-MM-DD_practical_drafts.md` を新しい日付順に表示する。
   - `target_count` を表示する。

6. テストを追加する。
   - 空日
   - 対象あり
   - 最新 Analysis 採用
   - raw 欠落除外
   - JST 日付境界
   - malformed date 拒否
   - 原典 URL / `changeId` / 確認中文言 / 専門家確認論点の出力
   - 「法律上問題ありません」「問題なし」「必ず安全」などの抑制
   - Obsidian sync: 新規作成、skip、force、Vault 未設定、元ファイル欠落
   - index 反映

7. 検証する。
   - `pnpm run build`
   - `pnpm test`
   - `pnpm lint`
   - temp vault を使った `pnpm drafts -- --date YYYY-MM-DD` と `pnpm obsidian-sync -- --drafts YYYY-MM-DD` の skip / force 確認

### 受け入れ条件

- `pnpm drafts -- --date YYYY-MM-DD` で `reports/drafts/YYYY-MM-DD_practical_drafts.md` が生成される。
- 原典 URL、`changeId`、確認中である旨、専門家確認が必要な論点が出る。
- 対象がない日も「該当なし」が分かる Markdown が生成される。
- 「法律上問題ありません」「問題なし」「必ず安全」などの保証表現を出さない。
- SNS/ブログ向け文案は不安を煽らず、原典確認前であることを明記する。
- `pnpm obsidian-sync -- --drafts YYYY-MM-DD` で `Legal Watch/drafts/YYYY-MM-DD_practical_drafts.md` に同期できる。
- 既存 Obsidian ファイルは `--force` なしでは上書きされない。
- `Legal Watch/index.md` から最近の転用下書きへ辿れる。

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
