# 2026-02-04 ハンドル1件表示の復旧 / 不明ブロック表示

## 目的
- アクティブ1件のみ表示のハンドルが出なくなった問題を復旧。
- Markdown直書きHTML/未知構文を「不明なブロック」としてそのまま表示。
- Enter補正中の contentMatchAt 例外をホスト通知で顕在化。

## ハンドル表示復旧
- `InlineDragHandle` のホバー解決を `.block-handle-host` 依存から脱却。
  - `posAtCoords` + `resolveListItemPosFromCoords` でブロック位置を決定。
  - テーブルは `.table-block` から pos を解決。
- `Decoration.widget` で生成するハンドルに `is-active` クラスを付与し、
  CSS で常時表示できるように。
- `position: relative` を direct child に付与し、NodeViewでも絶対配置が安定。
- `li` / `blockquote` ではハンドルの left をオフセットし、
  文字開始位置との距離を他ブロックと揃える。

## 不明ブロック (HTML / :::...)
- `HtmlToCodeBlock` を `rawBlock` へ変換する設計に変更。
  - HTML ブロックは code block ではなく「不明なブロック」表示。
- `RawBlock` tokenizer を `:::...` 全般に拡張。
  - 解析不能な `:::` ブロックは raw 文字列ごと保持。
- `renderMarkdown` は raw 文字列をそのまま出力。
- ラベル表記を `RAW` → `不明なブロック` に更新。

## Enter補正の例外
- `Selection.findFrom` の例外を捕捉し、
  `notifyHostError(ENTER_SELECTION_FIX_FAILED)` でホスト通知。

## 変更ファイル
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`
- `packages/webview/src/editor/rawBlockExtension.ts`
- `packages/webview/src/editor/htmlToCodeBlockExtension.ts`
- `packages/webview/src/editor/enterSelectionFixExtension.ts`
- `packages/webview/src/editor/createEditor.ts`
