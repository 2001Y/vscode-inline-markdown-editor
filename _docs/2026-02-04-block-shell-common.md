# 2026-02-04 ブロックシェル完全共通化 (方法A)

## 目的
- `pre` のグローバルスタイルによる余白混入を排除し、
  コード/フロントマター/不明ブロックで完全共通化。
- 引用/テーブルも同一の背景・角丸・余白に統一。

## 実装
- `.inline-markdown-editor-content` に共通変数を定義。
  - `--block-shell-bg`, `--block-shell-radius`, `--block-shell-margin`, `--block-shell-padding`
- **グローバル `pre` の margin/padding/background を無効化。**
- 外枠は wrapper 側へ集約。
  - `.code-block-wrapper > .block-content`
  - `.frontmatter-block-wrapper > .block-content`
  - `.raw-block > .block-content`
  - `.blockquote-block > blockquote`
  - `.table-block > .block-content`
- `pre.code-block` / `pre.frontmatter-block` の「単体出力」もカバーしつつ、
  wrapper 内では `background/margin` を打ち消し。

## 影響
- 不明ブロック余白問題は `pre` の特異性競合から解消。
- 引用/テーブルは共通シェルで見た目が統一。
