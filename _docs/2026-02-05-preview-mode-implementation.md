# 2026-02-05 プレビューモード実装（HTML RAW / Mermaid）

## 目的
- `rawBlock(kind=html)` は **HTML を iframe でプレビュー表示**できるようにする（右上トグル）。
- `codeBlock(language=mermaid)` は **Mermaid を iframe でプレビュー表示**できるようにする（右上トグル）。
- デフォルトは安全寄り（外部通信なし / HTML は JS 無効）。

## 実装概要
- 共通: `packages/webview/src/editor/blockPreview.ts`
  - 右上トグル UI
  - iframe 生成/破棄（Blob URL）
  - sandbox/CSP を doc 内に埋め込み
  - プレビュー on/off のログ（duration, sandbox など）
- 組み込み:
  - HTML RAW: `packages/webview/src/editor/rawBlockExtension.ts`
    - kind が `html` のときだけトグル表示
  - Mermaid: `packages/webview/src/editor/disableKeyboardShortcuts.ts`
    - language が `mermaid` のときだけトグル表示

## セキュリティ方針
### Webview 本体 CSP
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - `frame-src blob:` / `child-src blob:` を追加（プレビュー iframe 用）

### iframe sandbox（重要）
- Mermaid: `sandbox="allow-scripts"` 固定
  - `allow-same-origin` は付与しない（iframe から親 DOM/VS Code API に触らせない）
- HTML: 設定で明示許可した場合のみ緩和（デフォルトは最小）

### iframe 内 CSP
- `connect-src 'none'`（外部通信なし）
- HTML: `script-src 'none'`（デフォルト）/ `allowScripts=true` のとき `script-src 'unsafe-inline'`
- Mermaid: `script-src <webview origin>`（拡張が配布する JS のみ）

### postMessage 経由の汚染対策
- `packages/webview/src/protocol/client.ts` で `event.source !== window` のメッセージを破棄
  - iframe 内 JS が `parent.postMessage(...)` しても SyncClient が受け取らない

## 設定（HTML プレビューの危険度調整）
- `inlineMark.preview.html.allowScripts`（default: false）
- `inlineMark.preview.html.allowSameOrigin`（default: false）
- `inlineMark.preview.html.allowPopups`（default: false）
- `inlineMark.preview.html.allowForms`（default: false）

## Mermaid のバンドル方法
### 現状
- `packages/webview/public/mermaid.min.js` を同梱し、iframe 内で読み込む。
- ランタイム: `packages/webview/src/preview/mermaidPreview.ts`（Vite entry）
  - `window.mermaid` を使って描画する（Mermaid は classic script でロード）
- 参照は meta 経由:
  - `packages/extension/src/editors/inlineMarkProvider.ts` が
    - `meta[name="inlineMark-mermaid-preview"]`（`mermaidPreview.js`）
    - `meta[name="inlineMark-mermaid-lib"]`（`mermaid.min.js`）
    を注入する。

### 背景（この repo の制約）
- この作業環境では npm registry への名前解決ができず、`npm install mermaid` が失敗したため、
  「同梱 JS」を採用した。

## 既知の制限
- iframe 高さは固定（CSS: 260px）。図が大きい場合は iframe 内でスクロール。
- HTML プレビューは raw 文字列をそのまま挿入するため、相対 URL の解決は期待通りにならない場合がある。

## 動作確認
- `npm run build` OK
- `npm run package` OK（`packages/extension/inlinemark-0.1.1.vsix`）

