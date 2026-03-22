# 2026-02-06 default preview + Mermaid font scale

## 目的
- 直書き HTML / Mermaid のプレビュー可能ブロックを初期状態でプレビュー表示する。
- Mermaid の文字サイズを VS Code の `editor.fontSize` を基準に調整し、設定で変更可能にする。

## 実装
- `BlockPreviewController` に初期自動プレビュー起動を追加。
  - `defaultPreviewEnabled`（既定 `true`）
  - `initialAvailable=true` のブロックで初回のみ `enterPreview()`
  - `setAvailable(true)` へ遷移したケース（例: code block が mermaid 化）でも初回自動起動
- 設定 `inlineMark.preview.mermaid.fontScale` を追加（既定 `0.8`）。
- Extension 側 `WebviewConfig.preview.mermaid.fontScale` で Webview へ配信。
- Mermaid preview の `fontSize` は `editor.fontSize * fontScale` を使用。

## 変更ファイル
- `packages/extension/package.json`
- `packages/extension/package.nls.json`
- `packages/extension/package.nls.ja.json`
- `packages/extension/package.nls.zh-cn.json`
- `packages/extension/src/editors/inlineMarkProvider.ts`
- `packages/extension/src/protocol/messages.ts`
- `packages/webview/src/protocol/types.ts`
- `packages/webview/src/editor/blockPreview.ts`
