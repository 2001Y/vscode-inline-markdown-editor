# 2026-02-03 Codicon フォント 401 修正

## 事象
- Webview で `codicon-*.ttf` が `file+.vscode-resource.vscode-cdn.net` に対して 401 になる。
- 生成された CSS で `url(/codicon-*.ttf)` のように **ルート絶対パス** になっていたため、
  Webview のローカルリソースルートに一致せずアクセス拒否。

## 対応
- `packages/webview/vite.config.ts` に `base: './'` を設定し、
  CSS 内のフォント URL を `url(./codicon-*.ttf)` に変更。
  - Webview の CSS 自身の URL 基準で解決されるため 401 を回避。
- `packages/extension/package.json` の `files` に `media/webview/*.js` を追加し、
  分割チャンクを VSIX に同梱。

## 結果
- `index-*.css` の `@font-face` が相対 URL になったことを確認。
- VSIX に webview チャンクが全て含まれる。
