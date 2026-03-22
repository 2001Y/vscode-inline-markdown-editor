# 2026-02-06 ProseMirror invalid content 例外対策

## 事象
- `WEBVIEW_RUNTIME_ERROR: Error: Called contentMatchAt on a node with invalid content` が連続発生し、編集体験が崩壊する。
- `init` は正常完了後に発生するため、初期化失敗ではなく編集トランザクション経路の問題。

## 対応
- `packages/webview/src/editor/createEditor.ts`
  - `filterTransaction` で `docChanged` トランザクションを事前検証するガードを追加。
  - `transaction.doc.check()` が失敗した場合はトランザクションを拒否して、壊れた状態への遷移を防止。
  - 通知コード `WEBVIEW_INVALID_TRANSACTION_BLOCKED` を送信し、`stepTypes` などの診断情報を残す。
- `packages/webview/src/main.ts`
  - `WEBVIEW_RUNTIME_ERROR` / `WEBVIEW_UNHANDLED_REJECTION` に `stack` を追加して原因追跡を容易化。

## 期待効果
- 不正コンテンツを生むトランザクションが state に適用されず、`contentMatchAt` の連鎖クラッシュを防止。
- 再発時もスタック付きで原因箇所を即追跡可能。
