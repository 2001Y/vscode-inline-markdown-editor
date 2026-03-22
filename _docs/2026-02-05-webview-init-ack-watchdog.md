# 2026-02-05 Webview init 受信確認（initAck）と watchdog 追加

## 背景
- Extension 側ログは `ready` → `Init sent` で止まり、Webview 側の進展が見えない。
- `postMessage` の戻り値は受信保証ではなく、Webview が `init` を受け取れない状態でも true が返る。
- ローディングが終わらない状態を「黙って待機」せず、即エラーで顕在化する必要がある。

## 方針
- Webview が `init` を**受信できたことを Extension に明示通知**する (`initAck`)。
- `ready` 送信後、一定時間 `init` を受け取れなければ **即 ERROR を通知**する watchdog を追加。
- 失敗時の切り分けに必要な **service worker controller / location.href** を必須ログに残す。

## 実装内容
### 1) Webview → Extension: `initAck`
- `initAck` をプロトコルに追加。
- `SyncClient.handleInit` で `initAck` を送信。
- Extension 側で `initAck` 受信ログを追加。

### 2) Webview init watchdog
- `SyncClient.start` と `resetSession` の直後に watchdog をセット。
- `init` が `INIT_MESSAGE_TIMEOUT_MS` 以内に来ない場合は `notifyHost(ERROR)`。
- 失敗時に以下を送信:
  - `elapsedMs`
  - `timeoutMs`
  - `reason` (start/resetSession)
  - `locationHref`
  - `serviceWorkerController`

## 変更ファイル
- `packages/webview/src/protocol/types.ts`
- `packages/webview/src/protocol/client.ts`
- `packages/extension/src/protocol/messages.ts`
- `packages/extension/src/editors/inlineMarkProvider.ts`

## 期待される効果
- `init` が Webview に届いているかを Extension 側のログで即判定できる。
- `init` 未着時は無限ローディングではなく ERROR で顕在化する。
- service worker controller mismatch との相関をログで追える。
