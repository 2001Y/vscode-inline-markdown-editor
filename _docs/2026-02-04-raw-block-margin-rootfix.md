# 2026-02-04 不明ブロック下部余白の根本対応

## 原因
- `.inline-markdown-editor-content pre` の `margin: 1em 0` が
  `raw-block-content` にも適用されていた。
- `.raw-block-content` の `margin: 0` は **特異性が低く上書きできず**、
  その結果、下部余白が残っていた。

## 対応
- セレクタを `.inline-markdown-editor-content pre.raw-block-content` に変更し、
  pre の margin を確実に上書き。
- これにより末尾改行削除ロジックを撤廃。

## 変更ファイル
- `packages/webview/src/styles.css`
- `packages/webview/src/editor/rawBlockExtension.ts`
- `packages/webview/src/editor/htmlToCodeBlockExtension.ts`
