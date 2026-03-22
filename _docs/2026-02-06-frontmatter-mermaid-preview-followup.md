# 2026-02-06 Frontmatter / Mermaid Preview Follow-up

## 対象
- Frontmatter ブロックの見た目差異
- Mermaid プレビューの拡大率・配色・CSP関連警告
- HTML/ Mermaid iframe の高さ追従

## 原因
1. Frontmatter は `:focus` 時だけ `selectionBackground` が当たっており、コードブロックと見た目が分岐していた。
2. Mermaid は iframe 幅に追従するスケーリングが有効で、エディタフォント基準のサイズ感からずれていた。
3. 高さ計測が `flowHeight` 寄りで、DOM構造によって過不足が出るケースがあった。
4. ラベル背景は `editorWidget` 系色で、他のガイド系 UI と馴染みにくかった。

## 実装
- `packages/webview/src/styles.css`
  - `.block-label` 背景を `var(--vscode-editorIndentGuide-background)` に変更。
  - `.frontmatter-block-content:focus` を選択背景ルールから除外（コードブロックと同等化）。
  - `.block-preview-container` / `.block-preview-iframe` に `min-width: 0` を明示。

- `packages/webview/src/editor/blockPreview.ts`
  - iframe 高さ計測を `documentElement/body` の `scroll/offset/client` 系最大値 + marker で評価する方式に変更。
  - Mermaid payload の `themeVariables` を VS Code 系色へ整理。
  - Mermaid iframe 内 `#root > svg` を `width:auto` / `max-width:none` / `height:auto` に固定。

- `packages/webview/src/preview/mermaidPreview.ts`
  - `flowchart.useMaxWidth = false` を明示。
  - レンダリング後に `svg` の `width/height` 属性を除去し、`preserveAspectRatio` を設定。

## 検証
- `npm run lint -w packages/webview`
- `npm run build -w packages/webview`
- `npm run build -w packages/extension`
- `npm run package`

生成物:
- `packages/extension/inlinemark-0.1.1.vsix`
