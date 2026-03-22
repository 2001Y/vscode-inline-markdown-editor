# Mermaid npm切替メモ（2026-02-06）

## 事象
- Mermaid プレビューで `file+.vscode-resource...` へのスクリプト読込が発生し、`ERR_NAME_NOT_RESOLVED` / CSP でブロックされる。
- 生成物に `mermaid.min.js` と `mermaidPreview-*.js` を分離した構成が残っており、Webview Blob iframe での読込経路と整合していなかった。

## 原因
- `mermaidPreviewStandalone.js` を出力する専用 build が未設定だった。
- Mermaid runtime の供給が npm 依存ではなく、外部ファイル読込前提の古い経路に依存していた。

## 修正
- `packages/webview/package.json`
  - `build` を `vite build && vite build -c vite.preview.config.ts` に変更。
  - `mermaid` 依存を `^11.12.2` に変更（公式 npm パッケージ）。
- `packages/webview/vite.preview.config.ts` を追加。
  - `src/preview/mermaidPreview.ts` を `mermaidPreviewStandalone.js` (IIFE) として出力。
  - `outDir: ../extension/media/webview`, `emptyOutDir: false`, `inlineDynamicImports: true`。
- `packages/mermaid` の暫定ローカルパッケージは削除。

## 確認
- `npm run build -w packages/webview` 成功。
- `npm run package` 成功。
- `packages/extension/media/webview/` に `mermaidPreviewStandalone.js` が出力され、`mermaid.min.js` / `mermaidPreview-*.js` は出力されないことを確認。

## 追加修正（2026-02-06 追記）
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - Webview CSP に `connect-src ${webview.cspSource} https://*.vscode-cdn.net` を追加。
  - Mermaid preview runtime を `fetch` で取り込む経路を許可。
- `packages/webview/src/editor/blockPreview.ts`
  - Mermaid runtime 読込候補を `meta指定`, `mermaidPreviewStandalone.js`, `mermaidPreview.js` の順で試行。
  - 旧配布物が残っていても新配布物へフォールバック可能にした。
- `packages/webview/src/protocol/client.ts`
  - 同期プロトコル外の `window.postMessage` を無視するフィルタを追加。
  - iframe の高さ通知メッセージで `PROTOCOL_VERSION_MISMATCH` が連続発生する問題を解消。
- `packages/webview/src/editor/blockPreview.ts`
  - HTML プレビューは sandbox に `allow-scripts` を付与し、内部スクリプト（高さ同期）だけ実行可能に変更。
  - `inlineMark.preview.html.allowScripts=false` 時は `<script>` タグを除去して実行を抑止。
