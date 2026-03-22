# 2026-02-03 タブ再オープン挙動 & ローディング表示

## 目的
- inlineMark の再オープンを「現在タブを閉じてから新規タブで開く」に統一し、保存せずに開いた場合の見た目不一致を回避する。
- TipTap 初期化中に画面中央へシンプルなローディング表示を出す。

## 対応内容
- `packages/extension/src/extension.ts`
  - `inlineMark.reopenWithTextEditor` / `inlineMark.reopenWithInlineMark` を改修。
  - アクティブタブを `tabGroups.close` で先に閉じ、`vscode.openWith` を `preview: false` で実行。
  - 失敗/キャンセル時はログを残して中断。

- `packages/webview/src/main.ts`
  - `#app` 直下にローディング要素を追加。
  - `handleInit` の開始で表示、初期化完了後 `requestAnimationFrame` で非表示。

- `packages/webview/src/styles.css`
  - `.app-loading` / `.app-loading-spinner` を追加（中央スピナー）。

## 期待効果
- inlineMark と通常エディタの切り替え時にタブが必ず切り替わり、状態の取り違えが起きにくくなる。
- TipTap 初期化中の視覚的な待ち状態が明確になる。
