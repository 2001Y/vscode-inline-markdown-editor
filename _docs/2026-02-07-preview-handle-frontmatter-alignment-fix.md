# 2026-02-07 Preview/Handle/Frontmatter 調整

## 依頼
- `.block-preview-iframe` の最小高さを 40px にする
- `.inline-markdown-editor-content > :not(.ProseMirror-widget):not(ul):not(ol)` の個別セレクタを削除
- 直書きHTML / Mermaid iframe のデフォルト背景を透明にする
- Frontmatter が code block と共通化されていない原因を特定・修正
- ハンドル位置ズレの計算を見直す

## 原因
### 1) Frontmatter が code block と揃わない
- `frontmatter` 専用ルールで `white-space: pre-wrap` が指定されており、通常 code block の表示特性（折り返ししない `pre`）と乖離していた。
- さらに code/frontmatter で二重管理セレクタがあり、見た目統一の変更が漏れやすい状態だった。

### 2) ハンドル位置がズレる
- トップレベルに対する `> :not(.ProseMirror-widget):not(ul):not(ol)` が全ブロックへ左右 padding を付与し、
  blockquote/table 側の個別 padding と重なってオフセットが過剰になっていた。
- ドラッグ時のブロック開始X計測が「ホスト要素の padding のみ」基準で、
  実際のテキスト開始位置（`pre`/`blockquote`/`table`）とズレるケースがあった。

## 修正
- `packages/webview/src/styles.css`
  - `.block-preview-iframe` の `min-height` を `40px` に変更。
  - `> :not(.ProseMirror-widget):not(ul):not(ol)` を削除。
  - 代わりに `> .block-handle-host` へ統一的に左右 gutter を適用。
  - blockquote/table の重複 gutter 指定を削除。
  - code/frontmatter のシェル指定を `code-block` 基準へ整理（重複セレクタ削減）。
  - `frontmatter-block-content` を code block 準拠（`white-space: pre`）に変更。

- `packages/webview/src/editor/blockPreview.ts`
  - `PREVIEW_MIN_HEIGHT` を `40` に変更。
  - HTML preview iframe 内で `.inline-markdown-editor-content` / `.preview-markdown-content` の背景を透明化。
  - Mermaid payload の `background` / `themeVariables.background` / `edgeLabelBackground` を透明化。

- `packages/webview/src/editor/inlineDragHandleExtension.ts`
  - `resolveBlockTextStartX` を更新し、
    `block-content` → 直下のテキスト系要素（pre/p/heading/blockquote/table）→ ホスト の順で
    開始Xを解決するよう変更。

## 検証
- `npm run lint -w packages/webview` ✅
- `npm run build -w packages/webview` ✅
- `npm run test` ✅
