# 2026-01-12 ネストページ作成タイムアウト調査（o3）

## 目的
- Webview から `createNestedPage` を送っても timeout になる問題を、公式/標準寄りの設計で堅牢化する。

## o3 要約（要点のみ）

### 1) RPC 化（requestId + ACK + 完了通知）
- **受信確認 ACK** を先に返すと「届いていない」vs「処理中」を即切り分けできる。
- 完了通知（created / failed）は ACK とは別に返す。
- **timeout は ACK と完了で別に持つ**（ACK は短く、完了は長め）。

### 2) ready ハンドシェイク + 送信キュー
- Webview が listener を張る前に送信すると落ちる可能性がある。
- `ready` を受け取ってから送信する or キューして flush する。

### 3) 複数パネル問題
- 同一 doc を複数パネルで開けると「受信パネルと返信パネルがズレる」事故が起きる。
- **`supportsMultipleEditorsPerDocument: false`** が最短で安全。
- 複数対応するなら **必ず送信元 panel に返信**する設計が必要。

### 4) 観測ポイント
- Webview: 送信直前ログ、ACK timeout、受信 raw event.data、beforeunload
- Extension: onDidReceiveMessage 入口ログ、postMessage の戻り値（true/false）、panel dispose/visible

## 今後の実装方針（候補）
- ACK 追加 + ACK timeout ログ（まず切り分け）
- ready 後送信/キュー導入
- 必要なら multi-panel を止める

