# 2026-03-04 編集不能（Invalid transaction）根因修正

## 事象
- `WEBVIEW_INVALID_TRANSACTION_BLOCKED` が連発し、編集が実質不能。
- ログは `RangeError: Invalid content for node doc` を示し、先頭に `frontmatterBlock` が表示されるため frontmatter 起因に見える。

## 根因
- 実際の不正ノードは frontmatter ではなく `image`。
- `Image.configure({ inline: true })` 構成で、Paragraph の標準 `parseMarkdown` が「画像のみ段落」をアンラップし、`doc` 直下に inline `image` を置いてしまう。
- `doc` は `block+` のため、トップレベル inline ノード混入でスキーマ不整合になる。

## 修正
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
  - `ParagraphNoShortcut.parseMarkdown` を追加。
  - 画像単独段落をアンラップせず、常に `paragraph` ノードとして保持するよう変更。

## 補助修正
- `packages/webview/src/editor/debug.ts`
  - `window.inlineMarkDebug = DEBUG` を `typeof window !== 'undefined'` ガード下へ移動（Node 環境検証時の即時クラッシュ防止）。

## 検証
- `npm run lint -w packages/webview` 成功
- `npm run build -w packages/webview` 成功
- `npm run test` 成功

## 期待効果
- 画像行を含む Markdown でも `doc` がスキーマ整合を保ち、Enter/入力時に invalid transaction が連鎖しない。
