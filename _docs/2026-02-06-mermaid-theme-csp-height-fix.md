# 2026-02-06 Mermaid配色/CSP/iframe高さ 修正

## 事象
- Mermaid プレビューは表示されるが、コンソールに `Applying inline style violates CSP` が大量発生する。
- ダークテーマで Mermaid の線が黒く、視認性が悪い。
- 直書きHTML プレビューの iframe 高さが過大・不安定になる。
- 一部環境で `PROTOCOL_VERSION_MISMATCH` が大量発生する。

## 原因
- Mermaid iframe の `style-src` に nonce と `'unsafe-inline'` を同居させていたため、Mermaid が生成する inline style が CSP で抑止される。
- Mermaid テーマ色を VS Code 変数から渡しておらず、既定色依存になっていた。
- 高さ計測が `height: 100%` / `min-height: 100%` と `scrollHeight` 計測を組み合わせていたため、iframe 高さ更新と相互増幅していた。
- SyncClient が `type` だけ一致する protocol 外メッセージ（`v` なし）をバージョン不一致として扱っていた。
- 親 Webview の CSP (`style-src 'nonce-...'`) が iframe に継承され、iframe 側の CSP を緩和しても Mermaid の inline style がブロックされていた。
- CodeBlock NodeView で `code.className = ...` を毎更新で上書きしており、プレビュー時に付与した非表示クラスが剥がれてコード本文が再表示されていた。
- HTML プレビューで `.inline-markdown-editor-content` を流用した結果、既存 CSS の疑似要素 `::after (90vh)` が効き、高さ計測を過大化していた。

## 対応
- `packages/webview/src/editor/blockPreview.ts`
  - `style-src` を nonce 非依存化（`'unsafe-inline'` + webview source）して Mermaid inline style を許可。
  - 高さレポータを `requestAnimationFrame` 集約 + 変化時のみ postMessage に変更。
  - `MutationObserver` / `ResizeObserver` / `toggle` / `resize` を統合し、アコーディオン等の動的高さ変更へ追従。
  - HTML/Mermaid preview 内の `html, body { height: 100%; }` と `.preview-markdown-content { min-height: 100%; }` を削除。
  - Mermaid payload に VS Code 由来の色変数（背景/前景/境界/アクセント）を追加。
- `packages/webview/src/preview/mermaidPreview.ts`
  - Mermaid 初期化を `theme: 'base'` + `themeVariables` 方式へ変更。
  - `themeVariables` に VS Code 変数由来の色を反映。
- `packages/webview/src/protocol/client.ts`
  - `v` が無いメッセージは protocol 外として無視し、誤 `PROTOCOL_VERSION_MISMATCH` を防止。
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - 親 Webview CSP の `style-src` を nonce 制約から `unsafe-inline` 許可へ変更し、iframe 内 Mermaid の inline style を許可。
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
  - CodeBlock NodeView の言語クラス更新を `className` 直代入から `classList` 差分更新へ変更。
  - プレビュー時の非表示クラスが消えず、編集DOMの露出が起きないよう修正。
- `packages/webview/src/editor/blockPreview.ts`
  - HTML プレビュー側で `inline-markdown-editor-content::after` を無効化し、高さ計測への外乱を除去。
  - Mermaid はダーク判定分岐を廃止し、VSCode変数を `themeVariables` へ直接適用。

## 検証
- `npm run build -w packages/webview` 成功
- `npm run lint` 成功
- `npm run test` 成功
- `npm run package` 成功
