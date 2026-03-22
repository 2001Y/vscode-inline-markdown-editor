# 2026-02-05 プレビューモード実装計画（HTML RAW / Mermaid）

## 目的
- 不明ブロックの中身が HTML の場合、**プレビュー表示**を可能にする。
- コードブロックが Mermaid の場合、**プレビュー表示**を可能にする。
- 右上トグルで **Edit/Preview** を切替。
- できるだけ共通化し、拡張対象を増やせる構造にする。

## 前提
- HTML はデフォルト RAW 表示（設計書方針）。安全性と挙動は **明示的なプレビュー切替**の時だけ許可。
- Mermaid の描画は iframe 内で完結し、外部通信無し（既存 CSP 方針に準拠）。
- UI は既存ブロック UI と統一し、**右上トグル**を追加。
- デフォルトは **安全寄り**。ユーザーが設定で許可した場合のみ JS 等を許可する。
- Mermaid は `packages/webview` に依存追加して **バンドル**する（CDN は使わない）。

## 方針（共通化）
- **BlockPreviewController**（仮称）を導入し、次を 1 箇所で管理する。
  - 右上トグル UI
  - preview on/off
  - iframe 生成/破棄
  - srcdoc 生成（CSP/sandbox を含む）
  - ログ（toggle/render/失敗）
- NodeView 側は「対象判定」と「PreviewBlockController の呼び出し」に限定する。
- プレビュー対象は **type + attrs + content** で判断。

## 対象ブロック
1. RAW ブロック（kind=html）
   - RawBlock NodeView に PreviewToggle を追加。
   - content が HTML と判定できる場合のみトグル表示。
2. codeBlock（language=mermaid）
   - CodeBlock NodeView に PreviewToggle を追加。
   - language が mermaid（大小文字無視）ならトグル表示。

## UI / UX
- 右上トグル（icon + tooltip）
- プレビュー時は editor (contentDOM) を非表示、iframe を表示。
- 編集に戻る時は iframe を破棄し、contentDOM を表示。

## 設定（安全→許可の順）
- `inlineMark.preview.html.allowScripts` (boolean, default: false)
- `inlineMark.preview.html.allowSameOrigin` (boolean, default: false)
- `inlineMark.preview.html.allowPopups` (boolean, default: false)
- `inlineMark.preview.html.allowForms` (boolean, default: false)
- Mermaid は初期は設定無し（必要なら `inlineMark.preview.mermaid.enabled` を追加）

## セキュリティ / CSP（Webview本体）
- Webview の CSP に `frame-src` を追加して iframe を許可する。
- 方針: `frame-src ${webview.cspSource} blob: data:` を基本（必要最小限に調整）。
- 既存の `img-src`/`script-src`/`style-src` は維持し、外部通信は増やさない。

## セキュリティ / sandbox（iframe）
- HTML preview（デフォルト）: scripts は sandbox で無効、危険操作も禁止。
- HTML preview（設定で許可）: `allow-scripts` 等を追加。`allowSameOrigin` はデフォルト false。
- Mermaid preview: `allow-scripts` は必須。`allow-same-origin` は **禁止**（iframe から親DOMに触れない）。

## 実装詳細（Mermaid）
- Vite の entry を追加し、iframe 用の `mermaidPreview.js` を生成する。
- iframe `srcdoc` から `mermaidPreview.js` を読み込み、payload（diagram text + theme）を DOM から取得して描画。
- 失敗時は iframe 内にエラーを表示し、親へも ERROR ログを送る（postMessage）。

## 予定ファイル
- `packages/webview/src/editor/previewBlock.ts`（新規）
  - toggle UI 生成
  - iframe 生成
  - srcdoc 作成
- `packages/webview/src/editor/rawBlockExtension.ts`
  - PreviewBlockController を利用
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`（CodeBlock NodeView）
  - PreviewBlockController を利用
- `packages/webview/src/styles.css`
  - 右上トグル / iframe 表示の共通 CSS
- `packages/webview/src/preview/mermaidPreview.ts`（新規、Vite entry）
  - iframe 内の Mermaid 描画ランタイム

## ログ
- preview on/off
- renderer 種別（html/mermaid）
- srcdoc length
- render duration
- sandbox/CSP 設定（危険な許可が入った場合は WARNING）

## 次の検討事項
- Mermaid レンダラの実装（mermaid ES module の bundle 方式）
- HTML プレビューで許可するタグ/属性の範囲
- ユーザー設定で preview default を切り替えるか
