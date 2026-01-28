# 2026-01-19 handleLogger 未定義エラー修正

## 症状
- `Uncaught ReferenceError: handleLogger is not defined` が Webview 起動直後に発生
- Blockquote NodeView の `handleLogger` が未定義

## 原因
- Blockquote NodeView 内で `handleLogger` 宣言が欠落していた

## 対応
- `BlockquoteNoShortcut.addNodeView()` に `const handleLogger = createHandleDecisionLogger('blockquote')` を追加
- 再ビルド/再パッケージで VSIX を更新

## 該当ファイル
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`

