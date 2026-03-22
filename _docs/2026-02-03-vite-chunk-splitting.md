# 2026-02-03 Vite chunk size 警告の解消

## 目的
- Webview build の chunk size 警告（500kB 超過）を解消。

## 対応
- `packages/webview/vite.config.ts` に `manualChunks` を追加。
  - `@tiptap` / `prosemirror` / `lowlight` / `@vscode/codicons` / その他 `vendor` に分割。
  - 公式推奨の code-splitting を使って警告の根本対応。

## 期待される効果
- `index.js` の巨大化を抑制し、Vite の chunk size 警告を解消。

## 実行メモ
- `npm run package` の build で警告の有無を確認。
