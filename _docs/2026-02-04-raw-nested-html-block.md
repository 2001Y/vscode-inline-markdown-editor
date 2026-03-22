# 2026-02-04 RAWネスト対応 + HTMLブロック1件化

## 目的
- `:::raw` 内に `:::note` 等がある場合に分割される問題を解消。
- HTMLブロックは 1つの不明ブロックとしてまとめて表示。

## 実装
### RAW ネスト対応
- `parseRawBlockFromSource` を追加し、`:::` 深さを追跡。
- 深さが 0 に戻る `:::` までを 1 ブロックとして raw に保持。
- 見つからない場合は従来の正規表現にフォールバック。

### HTML ブロック1件化
- `htmlToCodeBlockExtension` に block tokenizer を追加。
- `<...>` で始まり `>` で終わる行を連続収集して 1 token にまとめる。
- すべて `rawBlock(kind=html)` として保持。

## 影響
- HTML/RAW が分断されずに 1ブロックで表示。
- inline HTML は block tokenizer に拾われない設計。

## 追記（2026-02-04）
- HTML ブロックの独自 tokenizer は **全文飲み込み**の不具合を起こすため削除。
- Marked 標準の HTML block tokenizer に移行し、1件化は標準挙動で担保する。
- 詳細は `2026-02-04-html-block-parser-fix.md` を参照。
