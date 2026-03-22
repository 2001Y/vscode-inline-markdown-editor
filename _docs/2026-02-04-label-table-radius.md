# 2026-02-04 ラベル背景 / 不明ブロック余白 / テーブル角丸

## 目的
- `.block-label` の背景色を VS Code 既存変数へ置換。
- 不明ブロック / コード / frontmatter の余白差を解消。
- テーブルにも角丸を付与。

## 変更点
- `styles.css`
  - `.block-label` 背景を `--vscode-editorWidget-background` に変更。
  - 点線は `.raw-block .block-label` のみに限定。
  - 不明ブロックは `raw-block-content` の `padding-top: 28px` でコードブロックと同等の余白。
  - `.table-block > .block-content` に `border-radius: 6px; overflow: hidden;` を追加。
  - frontmatter は `pre.code-block` 側で共通化。
