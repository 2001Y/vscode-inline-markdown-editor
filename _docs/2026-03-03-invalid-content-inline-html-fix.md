# 2026-03-03 編集不能（Invalid content）再発の根治修正

## 事象
- Webview 編集中に `Called contentMatchAt on a node with invalid content` が発生。
- 続いて `WEBVIEW_INVALID_TRANSACTION_BLOCKED` が連発し、編集トランザクションがすべて拒否されるため実質編集不能になる。

## 原因
- `htmlToCodeBlock` が **インラインHTML** まで `rawBlock`（block ノード）へ変換していた。
- インライン文脈（paragraph 等）に block ノードが混入すると schema が壊れ、次回トランザクション検証で `Invalid content for node doc` になる。

## 修正
- `packages/webview/src/editor/htmlToCodeBlockExtension.ts`
  - `token.block !== false` のときのみ `rawBlock(kind=html)` に変換。
  - `token.block === false`（インラインHTML）は `text` ノードとして保持。

## 期待効果
- paragraph 配下への block ノード混入が止まり、`contentMatchAt` / `Invalid content for node doc` の再発経路を遮断。
- `InvalidTransactionGuard` が常時ブロック状態へ入る事象を回避。
