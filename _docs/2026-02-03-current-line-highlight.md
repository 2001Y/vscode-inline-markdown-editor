# 2026-02-03 現在行ハイライトの VS Code 互換化

## 目的
- 選択行（カーソル行）のハイライトを VS Code に近づける。

## 対応
- `packages/webview/src/editor/currentLineHighlightExtension.ts`
  - selection が空のとき、最も近い textblock に `is-current-line` を付与。
  - 変更時のログを DEBUG で出力。
- `packages/webview/src/editor/createEditor.ts`
  - `CurrentLineHighlight` を拡張に追加。
- `packages/webview/src/styles.css`
  - `is-current-line` の背景を `block-content` に適用。
  - `editor.lineHighlightBackground` / `editor.lineHighlightBorder` に追従。

## 期待される効果
- 行ハイライトが VS Code の配色/雰囲気に近づく。
