# 2026-03-04 Preview Toolbar / 高さ追従 / 不明ブロック背景 / CurrentLine CSS

## 依頼
- ハイライトクラス付与は残し、見た目の CSS は削除。
- `block-preview-toolbar` を checkbox スイッチ UI に変更。
- 不明ブロック（raw kind!=html）の背景色を有効化。
- HTML iframe が縮んだ時も高さ追従するよう修正。

## 実装
- `packages/webview/src/styles.css`
  - `.is-current-line` のスタイル定義を削除（クラス付与ロジックは維持）。
  - `block-preview-toolbar` のトグル UI を `button` から `checkbox switch` 用 CSS へ置換。
  - `.raw-block:not([data-kind='html']) > .block-content` に `background: var(--block-shell-bg)` を明示。
- `packages/webview/src/editor/blockPreview.ts`
  - ツールバー操作を `button` から `input[type=checkbox]` ベースへ変更。
  - iframe 内高さ計測のルートを `data-inline-mark-preview-root="true"` に統一し、
    `clientHeight` 起因の縮小追従不全を回避。
  - HTML/Mermaid/Error 各 preview DOM に `data-inline-mark-preview-root="true"` を付与。

## 期待効果
- current line クラスは残るが、枠/塗りは出ない。
- preview トグルがスイッチ UI で統一される。
- unknown block の背景が code/blockquote/table 系と同系統で表示される。
- preview コンテンツ縮小時に iframe 高さが縮む方向にも追従する。
