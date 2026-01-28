# 2026-01-21 見出しサイズ調整・コードラベル編集

## 依頼
- 見出しのサイズジャンプ率をさらに縮小。
- 見出しの上部 margin を少し増やす。
- code block ラベルの横幅を内容にフィット。
- 可能なら contenteditable でのラベル編集。

## 対応
- 見出しフォントサイズを全体的に縮小し、差分を最小化。
- 見出し margin-top を 0.85em に調整。
- code block ラベルを contenteditable の span に戻し、`is-empty` で placeholder 表示。
- ラベルは `display: inline-flex` + `width: fit-content` で内容幅に追従。

## 変更ファイル
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
- `packages/webview/src/styles.css`
