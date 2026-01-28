# 2026-01-15 ブロックハンドルスタイル適用不良の修正

## 事象
- ブロックハンドル（+ / 6点）が表示されるが、`block-handle-container` / `block-add-btn` の CSS が当たらずデフォルトボタン見た目になる。
- DOM 変更（NodeView 化）後に顕在化。

## 仮説
- クラス/DOM 構造差分によりセレクタが外れている可能性。
- CSS はロードされているが、対象セレクタがマッチしないケースを想定。

## 対応（削除 & 追加）
- フォールバック用の `data-*` セレクタは削除。
- 既存クラス（`.block-handle-container` / `.block-add-btn` / `.block-handle`）に統一し直し、
  DOM 側は **削除 & 追加** でクラス一致を保証する方針に戻す。

## 変更点
- `packages/webview/src/styles.css`
  - フォールバック用 `data-*` セレクタを削除
  - `.block-handle-container` を基準にした構造へ統一

## 要確認
- ブロックハンドルが hover 時のみ表示されること
- CSP/manifest 起因で CSS が未ロードになっていないか（Webview DevTools で確認）
