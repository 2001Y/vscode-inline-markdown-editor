# 2026-02-05 initAck 監視と init 再送

## 背景
- Webview から `ready` は届くが、`init` が Webview に届かないケースが継続。
- `postMessage` の戻り値は受信保証ではないため、**受信確認が必要**。
- 失敗は即エラーで顕在化しつつ、原因特定のための再送ログを残す。

## 方針
- Webview から `initAck` を必ず返す。
- Extension 側で `initAck` を待機し、一定時間内に届かない場合は `init` を再送。
- リトライ上限を設け、上限到達時は ERROR を明示して中断。

## 実装
- `initAck` を受信するまで `INIT_ACK_TIMEOUT_MS` で監視。
- `MAX_INIT_ACK_RETRIES` を超えたら ERROR 通知。
- リトライ時は `reason=ack-timeout-retry` をログに残す。
- `sendInit` は例外もログする。
- Webview 側で `message` 生ログを少量出力し、`origin/source/type` を可視化。
- Extension 側で `logClient` を JSONL に残すため `docUri` を付与。

## 変更ファイル
- `packages/extension/src/editors/inlineMarkProvider.ts`

## 期待効果
- `init` 未着時に再送がかかったかをログで明確に追える。
- `initAck` 受信時刻が記録され、Webview 受信可否が判定できる。
- `init` が Webview に届いているか / フィルタで捨てているかを判別できる。
