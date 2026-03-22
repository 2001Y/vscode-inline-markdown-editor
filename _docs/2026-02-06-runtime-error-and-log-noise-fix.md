# 2026-02-06 runtime error / ログノイズ修正

## 事象
- `WEBVIEW_RUNTIME_ERROR: Called contentMatchAt on a node with invalid content` が init 後に連続発生。
- Webview コンソールで `appendTransaction -> insert` 経路が確認され、`tiptap-*.js` 上の `appendTransaction` 由来であることを確認。
- `BlockNodeView` の `Handle ineligible` が大量 `WARNING` 出力され、期待動作なのに警告ノイズ化。
- テスト fixture の画像 `./images/sample.png` が 404。

## 対応
- `packages/webview/src/editor/createEditor.ts`
  - `StarterKit.configure({ trailingNode: false })` を追加。
    - `appendTransaction(insert)` 経路を停止し、`contentMatchAt` 例外の連鎖を回避。
  - `injectCSS: false` を追加。
    - VS Code Webview CSP 下での Tiptap CSS 注入違反ログを抑止。
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
  - `Handle ineligible` のうち、期待される理由 (`in-list`, `in-table`, `in-blockquote`) は `INFO` に降格。
  - 想定外ケースのみ `WARNING` 維持。
- `packages/extension/test-fixtures/test/images/sample.png`
  - fixture 画像を配置して `./images/sample.png` の 404 を解消。

## 検証
- `npm run lint`: 成功
- `npm run test`: 成功
- `npm run package`: 成功（`packages/extension/inlinemark-0.1.1.vsix` 更新）
