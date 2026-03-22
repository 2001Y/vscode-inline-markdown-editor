# 2026-02-03 Webview ESM 読み込み修正

## 事象
- Webview コンソールに `Cannot use import statement outside a module` が出る。
- Vite の出力（`index.js`）は ES Modules で `import` を含むため、
  `<script>` が classic script として解釈されると失敗する。

## 対応
- `packages/extension/src/editors/inlineMarkProvider.ts` の script タグを
  `type="module"` に変更。
- `frame-ancestors` は `<meta>` CSP では無効のため削除。

## 備考
- `document.write` 警告は VS Code 側の index.html 由来で Webview 側の実装ではない。
