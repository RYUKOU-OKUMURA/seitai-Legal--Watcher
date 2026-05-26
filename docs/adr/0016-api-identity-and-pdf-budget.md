# API 監視対象の識別子と PDF 取得予算

日付付き API の監視対象キーは、API 内の安定IDだけではなく source id も含める。e-Gov 更新法令 API では `api:{sourceId}:{LawId}` を targetKey とし、日付は含めない。同じ法令の更新を同一監視対象の状態変化として追跡し、将来別 API source が同じ ID を返しても衝突しないようにする。

HTML 配下または単独 PDF の取得は、Phase 1.2 で官報・自治体 PDF が増える前に保守的な予算を設ける。PDF 1件あたり 10 MiB を上限とし、`Content-Length` または取得後 byte length が上限を超える場合は抽出失敗として記録する。`application/pdf`、`application/octet-stream`、PDF URL で Content-Type が未指定の応答は許可し、HTML/JSON 等は PDF 抽出対象外とする。

**Status**: accepted

**Considered Options**: `api:{LawId}` の維持 / `api:{sourceId}:{YYYYMMDD}:{LawId}` / PDF 上限なし

**Consequences**: API targetKey 変更後は既存 state を移行せず、`pnpm reset-state --clear-raw` と `pnpm bootstrap` で再ベースライン化する。PDF 取得失敗はジョブ全体を止めず `pdfErrors` とレポートに残す。
