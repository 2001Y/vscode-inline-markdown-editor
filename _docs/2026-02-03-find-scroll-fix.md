# 2026-02-03 Find 次/前移動のスクロール追従

## 事象
- Cmd+F の一致移動でビュー外の一致にジャンプしてもスクロールが追従しない。

## 原因
- `prosemirror-search` の `findNext/findPrev` が selection 変更は行うが、
  transaction に `scrollIntoView()` を付けていないため。

## 対応
- `packages/webview/src/editor/findWidget.ts`
  - `dispatchSearchSelection` を追加。
  - `findNext/findPrev` の dispatch をラップして `scrollIntoView()` を付与。
  - `addToHistory` を抑止し、ログに selection と理由を出力。

## 期待効果
- 一致に移動した際にスクロールが自動追従する。
