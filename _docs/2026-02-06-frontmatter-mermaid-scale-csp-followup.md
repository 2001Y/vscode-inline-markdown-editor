# Frontmatter / Mermaid Follow-up (2026-02-06)

## 背景
- Frontmatter が code block と見た目一致しない。
- Mermaid プレビュー時に CSP 警告が大量発生し、表示が崩れるケースがある。
- HTML iframe の動的高さが不安定なケースがある。

## 原因
1. Frontmatter の `<pre.frontmatter-block>` が code block と同じレイアウト前提（`position: relative` / `code` の表示制御）を満たしていなかった。
2. Mermaid は描画時に多数の DOM 変化を行うため、高さ通知が短時間に連続しやすく、レイアウト収束前の値が混在しやすかった。
3. Mermaid テキストサイズは `themeVariables.fontSize` を渡していたが、SVG 側のフォント指定を明示しないと環境差分でズレるケースがある。

## 修正
- `packages/webview/src/styles.css`
  - `pre.code-block` と `pre.frontmatter-block` を同一の位置決め・`code` 表示制御に統一。
  - `block-label` 背景を `var(--vscode-editorIndentGuide-background)` に統一済み。
  - preview iframe/container の `min-width` は `0`（最小）を維持。

- `packages/webview/src/editor/blockPreview.ts`
  - iframe 高さ計測に `getBoundingClientRect().height` 系を追加。
  - `HEIGHT_EPSILON=2` で高さ通知の微小ゆらぎを抑制。
  - `toggle/resize/transitionend/animationend` を計測トリガに追加。
  - 初期収束用の短時間ポーリングを追加（20 tick）。
  - Mermaid iframe の SVG フォントを `--vscode-editor-font-*` 由来値に固定。

## 検証
- `npm run lint -w packages/webview` ✅
- `npm run build -w packages/webview` ✅
- `npm run build -w packages/extension` ✅
- `npm run package` ✅
- `npm run test` ✅

## 補足
- 配布物差し替え漏れを避けるため拡張バージョンを `0.1.2` に更新。
- 生成物: `packages/extension/inlinemark-0.1.2.vsix`
