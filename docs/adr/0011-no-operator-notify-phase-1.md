# Phase 1 では Operator 向け外部通知を行わない

Slack・メール・プッシュ等の外部通知は Phase 1 スコープ外とする。ワークフロー失敗は GitHub Actions UI および GitHub 既定の失敗通知に任せる。高重要度・要専門家確認の能動通知は Phase 4（要件定義 F4-3）で実装する。日次レポートは repo commit を Operator が後から閲覧する。

Phase 1.1 で失敗時のみ Slack Webhook を足すことは任意の拡張とし、初期出荷のブロッカーにしない。

**Status**: accepted

**Considered Options**: 日次サマリ Slack / 失敗時のみ Slack（Phase 1 から）

**Consequences**: Secrets に `SLACK_WEBHOOK_URL` は Phase 1 不要。`daily.yml` は notify ステップなし。
