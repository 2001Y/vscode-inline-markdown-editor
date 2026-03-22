# 2026-02-04 不明ブロックの余白調整

## 目的
- 不明ブロックの不要な下部余白を解消する。

## 変更点
- `styles.css`
  - `.raw-block-content` の `min-height: 60px` を削除。
- `rawBlockExtension.ts`
  - `token.raw` の末尾改行を 1 つだけ削除して表示を詰める。
- `htmlToCodeBlockExtension.ts`
  - inline HTML の raw も同様に末尾改行を 1 つ削除。

## 補足
- 余白の原因は `min-height` と `token.raw` の末尾改行による空行。
- 「そのまま表示」方針は維持しつつ、視覚的な空行のみ削減。 
