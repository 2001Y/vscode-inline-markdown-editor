# 2026-01-15 block-content 適用 / ハンドル範囲整理 / ネストページ自動オープン

## 目的
- ハンドル重複を解消し、**listItem と table のみ**に block-handle を限定する。
- 見出し/段落/引用などの**見た目を block-content に集約**し、ラッパーの変更で CSS が外れないようにする。
- ネストページ作成後に**新規タブで自動オープン**する。

## 対応内容
### 1) ハンドル表示の判定ロジック追加
- `shouldRenderBlockHandle()` を追加し、以下を禁止:
  - table cell 内の全ハンドル
  - listItem 内の**子要素**ハンドル（listItem 自体は許可）
- NodeView 側で `block-handle-host` を**必要時のみ付与**し、
  ハンドル生成/削除を toggle。

### 2) block-content へのスタイル移行
- h1-h6 / p / blockquote などの主要スタイルを `.block-content` に移動。
- nested-page / raw-block / html-block の枠線・背景・余白も `.block-content` に集約。
- `editor-container` の padding を 0 にし、`block-handle-host` に右側 gutter を追加。
- html-block のラベルは `.block-label` に統合し、CSS の二重ラベルを削除。

### 3) ネストページ自動オープン
- `BlockHandles` に `openNestedPage` を追加。
- ネストページ挿入後に `requestAnimationFrame` で `openNestedPage` を発火。
- Extension 側 `openWith` に `preview:false` を付与し新規タブ化。

## 変更ファイル
- `packages/webview/src/editor/blockHandlesExtension.ts`
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
- `packages/webview/src/editor/rawBlockExtension.ts`
- `packages/webview/src/editor/frontmatterBlockExtension.ts`
- `packages/webview/src/editor/plainTextBlockExtension.ts`
- `packages/webview/src/editor/htmlBlockExtension.ts`
- `packages/webview/src/editor/nestedPageExtension.ts`
- `packages/webview/src/editor/tableBlockWrapperExtension.ts`
- `packages/webview/src/editor/createEditor.ts`
- `packages/webview/src/styles.css`
- `packages/extension/src/editors/inlineMarkProvider.ts`
- `_docs/issue.md`

## 要確認
- listItem 内に子ブロックがある場合でもハンドルが 1 つだけになること。
- table 内（セル含む）に block-handle が出ていないこと。
- 見出し/段落/引用/ネストページ/RAW/HTML の枠線/余白が block-content に適用されていること。
- ネストページ作成後にブロック表示 → 新規タブで自動オープンが行われること。
