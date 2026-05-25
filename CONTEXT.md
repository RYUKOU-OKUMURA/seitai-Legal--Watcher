# Legal Watcher

BOSS個人向けの公開法令・行政情報ウォッチャー。特定の1院に紐づくSaaSではなく、公式情報源の横断監視とレポート化が中心。自院LP・SNSなどの連携はオプションの追加監視先として扱う。

## Language

**Operator**:
Legal Watcher を設定・実行・確認する個人（初期運用者は BOSS）。
_Avoid_: テナント、顧客、アカウント（マルチテナント製品を連想させる語）

**対象業態**:
レポート上の分類軸（整体院向け / 整骨院向け / 鍼灸・あん摩向け など）。Operator が所属する院の業態を表すものではない。
_Avoid_: 運用主体、テナント種別

**自院ソース**:
Operator が任意で追加する、自院の LP・SNS・広告文などの監視先。製品の必須スコープではない。
_Avoid_: コア監視対象、デフォルト監視ソース

**公式ソース**:
厚生労働省・消費者庁・e-Gov・官報・自治体など、要件で定義する公開の法令・行政情報源。Phase 1 では `sources.yaml` に列挙された Watch Target として登録する。
_Avoid_: 自院ソース（混同しない）

**監視設定**:
Operator が編集する YAML 群（`sources.yaml`、`keywords.yaml`、`display.yaml` 等）。Watch Target の正は `sources.yaml` の明示 URL 一覧。`enabled: false` の行は登録のみで Phase 1.0 では巡回しない。地域関心の変更は URL 列挙の追加・削除で行い、Phase 1 では都道府県コードからの自動 URL 生成はしない。
_Avoid_: コード内ハードコード、LLM による監視先探索

**Fetch Snapshot**:
1回の巡回で1監視対象（正規化URLまたはRSSエントリ）に対して取得した結果。`state.json` のハッシュと `fetch-log.jsonl` で監査する。HTML/PDF 全文は Git に commit しない。ダッシュボードの「件数」には含めない。
_Avoid_: 更新、Detected Change、原典スナップショット（混同しない）

**原典スナップショット**:
Detected Change 発生時に `data/raw/{change_id}.json` として保存する抜粋付きメタデータ（URL・取得日時・タイトル・本文抜粋・差分要約等）。原典の完全複製ではなく、再確認は原典 URL から行う。
_Avoid_: Fetch Snapshot 全文、レポート本文

**監視対象（Watch Target）**:
差分検知のキーとなる1単位。種別ごとに次のとおり。  
HTMLは正規化ページURL。RSS/Atomはエントリpermalink。e-Gov APIは法令ID等の安定ID。監視リストに載せたPDF単独URLはそのURL自体。
_Avoid_: フィードURL（RSSを1本に潰さない）、生URL（正規化前）

**Detected Change**:
1監視対象について、前回の Fetch Snapshot から変化があったと判定された1件の事象。システムの中心エンティティ。同一巡回でタイトル・本文・PDF・リンク一覧が複数変わっても1 Change にまとめる。種別は新規・更新・削除・取得失敗。HTML配下のPDF差分は親ページと同一 Change に含める（PDF単独URLを監視している場合を除く）。
_Avoid_: レポート行、分析結果、Fetch Snapshot

**内容更新件数**:
種別が新規・更新・削除の Detected Change の件数。ダッシュボードの「今日の更新」は原則これを指す。
_Avoid_: 取得失敗件数、Fetch Snapshot 数

**取得失敗（fetch failure）**:
監視対象への取得が失敗した事象。Detected Change（種別=取得失敗）として記録するが、内容更新件数には含めない。レポートでは別節または別カウンタで示す。
_Avoid_: 更新、削除（コンテンツ変化と混同しない）

**一次フィルタ（ルールゲート）**:
Detected Change に対するルールベースの送信判定。キーワード一致・公式ソース重み・監視対象の常時分析フラグで、Cursor SDK に渡すかどうかを決める。意味上の「関連度」は判定しない。
_Avoid_: 関連度（LLM側）、優先度（レポート並び。Analysis 後）

**Analysis**:
1件の Detected Change に対する Cursor SDK の要約・分類の出力。ルールゲートを通過した Change にのみ0または1件ぶら下がる。関連度（高・中・低）・重要度・対象業態・確認ポイント（`operator_checkpoints`）等を含む。ゲート不通過の Change には Analysis を作らない。
_Avoid_: Detected Change、一次フィルタ（送信判定と混同しない）

**確認ポイント**:
Analysis が列挙する、Operator が原典・実務・広告表現等を確認すべき項目。レポート見出しの表示名は設定の `operator_label` で上書き可能（初期値は BOSS でもよい）。
_Avoid_: BOSS（スキーマ・ドキュメントの固定語としては使わない）、法的断定

**確認済み（confirmed）**:
Operator が内容を確認した状態。Phase 4 までシステムは永続化しない。Phase 4 以降は SQLite 上の Analysis に紐づく属性。
_Avoid_: 未確認（Phase 1〜3 ではカウンタ・状態として扱わない）、Markdown チェックボックスのオンオフ（システムは解釈しない）

**週次集約**:
Phase 3 で、対象期間内の Analysis を統合して週次レポートを生成すること。gated out は主集計に含めない（付録一覧のみ可）。
_Avoid_: 週次で gated out の再 LLM、日次レポートの単純連結

**分析対象外（gated out）**:
ルールゲートで Cursor SDK に送らなかった Detected Change。Fetch Snapshot と Change は残るが Analysis なし。日次レポートでは末尾の「参考・未分析」節に、タイトル・原典URL・ゲート理由のみ載せる（要約なし）。
_Avoid_: 取得失敗、差分なし、Analysis（混同しない）

## Flagged ambiguities

| 用語・記述 | ドキュメント上の読み | 解決 |
|------------|---------------------|------|
| 「想定ユーザー：整体院の運営者」 | 1院向けプロダクト | **未解決** — Operator は個人、読者像は運営者でも製品は院非紐づけ（C） |
| 「BOSSが確認すべきこと」 | 専用オーナー用UI | **解決** — レポート見出しは「確認ポイント」、スキーマは `operator_checkpoints`、表示ラベルは設定で上書き可 |
| 要件定義 §1.7 `src/` vs 技術スタック monorepo | どちらが正か不明 | **解決** — Phase 1 から monorepo（[ADR-0001](./docs/adr/0001-monorepo-from-phase-1.md)） |
| 一次フィルタ vs SDK「関連度判定」 | 二重か競合か不明 | **解決** — 二段階（[ADR-0002](./docs/adr/0002-two-stage-filter-before-llm.md)） |
| Phase 1 実行環境（Actions vs Mac） | どちらが本番か不明 | **解決** — Actions 主（[ADR-0003](./docs/adr/0003-github-actions-primary-phase-1.md)） |
| Phase 1 永続化（JSON vs SQLite） | いつ DB か不明 | **解決** — Phase 1 は JSON/JSONL（[ADR-0004](./docs/adr/0004-json-storage-phase-1.md)） |
| Cursor SDK の呼び方（Actions） | local/cloud・単位不明 | **解決** — local + Change ごと `Agent.prompt`（[ADR-0005](./docs/adr/0005-cursor-sdk-local-prompt-per-change.md)） |
| 監視先・地域の持ち方 | TS vs YAML・自動生成 | **解決** — YAML 分割 + URL 明示（[ADR-0006](./docs/adr/0006-yaml-config-explicit-sources.md)） |
| 未確認／確認済み | Phase 1 から要るか | **解決** — Phase 4 まで持たない（[ADR-0007](./docs/adr/0007-no-confirmation-until-phase-4.md)） |
| プロンプトの正 | packages/llm vs Skill | **解決** — packages/llm のみ（[ADR-0008](./docs/adr/0008-llm-prompts-in-packages-only.md)） |
| Phase 1 出荷範囲 | 一括 vs 段階 | **解決** — 1.0→1.1→1.2（[ADR-0009](./docs/adr/0009-phased-phase-1-delivery.md)） |
| raw の Git commit | 全文 vs 抜粋 | **解決** — Change 時のみ抜粋 JSON（[ADR-0010](./docs/adr/0010-raw-on-change-excerpt-only.md)） |
| Phase 1 通知 | Slack 等 | **解決** — なし（[ADR-0011](./docs/adr/0011-no-operator-notify-phase-1.md)） |
| 要件定義・技術スタックの更新タイミング | 今 vs 実装時 | **解決** — 1.0 着手直前（[ADR-0012](./docs/adr/0012-sync-legacy-docs-before-1-0.md)） |
| 週次の入力範囲 | Analysis のみか全 Change か | **解決** — Analysis のみ（[ADR-0013](./docs/adr/0013-weekly-from-analysis-only.md)） |
| Phase 1.0 パイロット URL | どれを有効化 | **解決** — 5件（[ADR-0014](./docs/adr/0014-phase-1-0-pilot-sources.md)） |

## Example dialogue

**Dev**: 週次レポートの「整骨院への影響」は、この院が整骨院だから書くんですか？

**Domain expert**: いいえ。今週拾った更新が、整骨院運営者の視点で読むと何が気になるか、という切り口です。BOSSは整体も整骨も鍼灸も横断で見たいので、レンズを分けているだけです。

**Dev**: 自治体ページはどの県を見ますか？

**Domain expert**: Operator が関心のある地域を設定に書く。院の所在地＝監視地域、とは限りません。

**Dev**: 同じページでタイトルも本文も変わったら、件数は2ですか？

**Domain expert**: 1件です。1つの Detected Change に差分を全部入れる。レポートもLLMも1回で足りる。

**Dev**: 差分がない日の巡回は？

**Domain expert**: Fetch Snapshot は残す。Detected Change は作らない。日次レポートは「更新なし」で、件数は0。

**Dev**: 厚労省RSSで記事が3本出たら？

**Domain expert**: permalinkが3つなら Detected Change は3件。フィードURL1本として数えない。

**Dev**: 昨日は取れたのに今日タイムアウトしたら「更新3件」に入る？

**Domain expert**: 入れない。取得失敗は Change として残すが、内容更新件数とは分ける。

**Dev**: キーワードに無い一般健康ニュースの Change は？

**Domain expert**: Change は残す。ルールゲートで LLM には送らない。分析対象外。週次でノイズが気になったらキーワードかソース重みを直す。
