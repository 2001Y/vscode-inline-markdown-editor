# Blockquote wrapper + view options

## 目的
- blockquote のハンドルをラッパーへ移動して背景がハンドルに被らないようにする。
- Webview の表示オプション（全幅 / 折り返しなし）を追加し、既定値を要件通りにする。

## 変更概要
- blockquote NodeView をラッパー構造に変更し、ハンドルはラッパー、blockquote は背景のみ。
- WebviewConfig に view.fullWidth / view.noWrap を追加。
- `inlineMark.view.fullWidth`（既定: true）と `inlineMark.view.noWrap`（既定: null = VS Code の `editor.wordWrap` に追従）を追加。
- Webview 側でクラスを切り替えて全幅 / 折り返しなしを反映。

## 反映箇所
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`（BlockquoteNoShortcut NodeView）
- `packages/webview/src/styles.css`（blockquote 背景、全幅/折り返しなし）
- `packages/extension/package.json` / `package.nls*.json`（設定追加）
- `packages/extension/src/editors/inlineMarkProvider.ts`（設定反映）
- `packages/extension/src/protocol/messages.ts` / `packages/webview/src/protocol/types.ts`（config 型追加）
- `packages/webview/src/main.ts`（View config 適用）
