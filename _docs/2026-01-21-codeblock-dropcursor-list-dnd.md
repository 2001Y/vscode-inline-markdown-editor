# 2026-01-21 CodeBlock Label / Dropcursor / List DnD

## 依頼
- code block ラベルを編集可能に。
- 見出しサイズが大きいのでジャンプ率を抑制。
- ドロップカーソルを fixed ではなく absolute に。
- リストのドラッグ挿入位置と挿入線のズレを改善。

## 対応方針
- code block NodeView 内で `input` を使い、attrs を更新する方式に変更。
  - `contenteditable` の揺れを避け、blur/Enter で確定。
- 見出し font-size を縮小し、サイズ変化の差を低減。
- `.ProseMirror` を `position: relative` にし、dropcursor を `position: absolute !important` で固定。
- `resolveDropTargetPos` で `LI` を特別扱いしないようにし、dropcursor の位置と manual drop の位置を揃える。

## 変更ファイル
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`
