# 2026-02-04 blockquote / code block 共通化

## 目的
- コードブロックと引用の背景/余白/角丸を共通化。

## 変更点
- `styles.css`
  - `--block-shell-*` 変数を `inline-markdown-editor-content` に追加。
  - `pre` / `blockquote` / `raw-block` を同一の背景・角丸・余白で統一。
  - blockquote の background/margin は共通側に寄せて削除。

## 補足
- blockquote の左線は `blockquote > .block-content` に残し、
  見た目は維持。 
