# 2026-01-17 DnD / Nested / Link 修正メモ

## 目的
- listItem / heading のドラッグが開始ログのみで移動しない問題を修正。
- 初回 nested page 作成（親移動あり）で作成ファイルが開かれない問題を是正。
- Cmd/Ctrl 押下時以外のリンクカーソル pointer を解消。

## o3MCP 要点
- `stopEvent` で dragstart が PM に届かない場合、**dataTransfer への HTML/Text 設定と serializeForClipboard を使う**のが必須。HTML に `data-pm-slice` が入らないと drop が壊れやすい。
- manual drop は **自分が確実に処理できる場合のみ preventDefault**。noop 判定が外れると「何も起きない」ので、`false` を返して PM 既定 drop にフォールバックさせるのが安全。
- listItem は NodeSelection の slice 文脈が崩れやすいので、**PM 既定の drop に乗せる方が安全**。

## 実装方針（最小）
- dragstart で `serializeForClipboard` を使って `text/html` + `text/plain` を dataTransfer に入れる。
- `view.dragging` には `{ slice, move, node }` をセットし、move 判定は Ctrl/Alt 修飾で決定。
- manual drop の noop は `true` で抑止せず `false` を返し、PM 既定 drop にフォールバック。
- nested page 作成は **パネルが利用不可なら拡張側で open**。
- リンク cursor は **`!important` で default text を強制**し、Cmd/Ctrl 押下時のみ pointer。

## 変更点
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
  - dragstart で `serializeForClipboard` を利用し dataTransfer を設定
  - `view.dragging` に `move/node` を付与
  - manual drop noop 時は `false` を返して PM 既定 drop にフォールバック
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - nestedPageCreated が送れない場合に拡張側で open
- `packages/webview/src/styles.css`
  - link cursor の優先度を `!important` で強制

## 検証ポイント
- listItem / heading がブロック間で移動できるか
- dropcursor がブロック間に出るか
- 親移動を伴う nested page 作成で作成ファイルが即 open されるか
- Cmd/Ctrl 押下時のみリンクカーソルが pointer になるか
