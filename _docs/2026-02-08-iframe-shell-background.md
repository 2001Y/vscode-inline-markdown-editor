# 2026-02-08 iframe プレビュー背景を block shell 背景へ統一

## 依頼
- iframe 系のコードブロック（直書きHTML / Mermaid）内に黒い背景が見える理由を解消したい。
- iframe 内 `body` 背景に block shell 背景を適用する。

## 原因
- iframe 内の HTML/Mermaid ドキュメントは `body { background: transparent; }` だった。
- そのため iframe 内で透明合成された結果、描画キャンバス側の黒が見えるケースがあった。

## 修正
- `packages/webview/src/editor/blockPreview.ts`
  - HTML preview `srcdoc` の `:root` に `--block-shell-bg` を追加。
  - HTML preview `body` 背景を `var(--block-shell-bg)` に変更。
  - Mermaid preview `srcdoc` の `:root` に `--block-shell-bg` を追加。
  - Mermaid preview `body` 背景を `var(--block-shell-bg)` に変更。

## 期待結果
- iframe プレビュー内の背景色が、外側の code-like block shell と同系統で安定する。
- テーマによる黒キャンバス露出が起きにくくなる。
