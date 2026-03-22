# 2026-02-08 Mermaid inline SVG + iframe height stabilization

## 目的
- Mermaid プレビューを `img(data:image/svg+xml,...)` 経由から inline SVG 直挿入へ完全切替する。
- 既存 UI（中央揃え、フォントサイズスケール、背景/配色）を変更せず、動的高さ追従を安定・軽量化する。

## 変更内容

### 1) Mermaid 表示経路を inline SVG へ完全切替
- `packages/webview/src/preview/mermaidPreview.ts`
  - `svgToDataUri` を削除。
  - `DOMParser` で Mermaid 出力 SVG をパースし、`#root` へ `document.importNode(...)` で挿入。
  - `mermaid.render()` の `bindFunctions` を DOM 挿入後に呼び出し。
  - `img` 要素生成経路を完全削除（フォールバックは残さない）。

### 2) iframe 高さ計測の軽量化（UI不変）
- `packages/webview/src/editor/blockPreview.ts`
  - 高さ計測から全要素 TreeWalker 走査を削除。
  - `#root` の矩形、`body`/`documentElement` の `scroll/offset/client` メトリクス、marker の flow 高さで決定する方式に変更。
  - `ResizeObserver` の監視対象に `#root` を追加。

## UI不変の担保
- CSS クラス `inline-mark-mermaid-svg` は維持。
- 既存の中央揃え (`#root { display:flex; justify-content:center; }`) とフォントサイズ供給（`editor.fontSize * mermaid.fontScale`）の経路は未変更。

## 検証
- `npm run lint -w packages/webview` ✅
- `npm run build -w packages/webview` ✅
