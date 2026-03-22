# 2026-02-03 Find Widget ビジュアル整合

## 目的
- Find/Replace UI を VS Code の見た目に近づける。
- 余計な高さ固定やリサイズハンドルの見え方を排除する。

## 対応内容
- `packages/webview/src/styles.css`
  - Find ウィジェットの余白/角丸/影/色を VS Code 風に調整。
  - 入力とトグルを同一行に配置（縦積みを廃止）。
  - ボタン/トグルのサイズ・配置を統一。
  - Replace 行の左インデントを Find 入力と揃える。
  - 既存の `resize: both` を廃止し、下部リサイズハンドルを非表示化。
- `packages/webview/src/editor/findWidget.ts`
  - 左エッジのリサイズハンドル（水平のみ）を追加。
  - 高さ保存を廃止し、`height` は常に自動。
  - リサイズ開始/終了のログを追加。

## 期待効果
- VS Code と同等の密度/レイアウトで表示される。
- 不要な高さ固定による UI ずれが解消される。
- リサイズは VS Code と同様に左エッジドラッグで行える。
