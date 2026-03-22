# 2026-02-04 block-label共通化 / html inline対応 / bottom spacer

## 目的
- `.block-label` の背景色を専用変数にし、点線は不明ブロックのみ。
- `.tiptap:after` で 90vh スペーサーを追加。
- HTML inline を `rawBlock` 化しない（schema破壊を防止）。

## 変更点
- `styles.css`
  - `--block-label-background` 追加。
  - `.block-label` の点線を削除し、`.raw-block .block-label` のみに適用。
  - `.inline-markdown-editor-content::after, .tiptap::after` を追加。
- `htmlToCodeBlockExtension.ts`
  - `token.block === false` の場合は `text` ノードで返し、
    inline HTML を block として挿入しない。

## 背景
- `contentMatchAt` エラーは「inline HTML を block として挿入」すると
  paragraph 内に block が入って schema を壊すため発生しやすい。
  そのため inline HTML は text として保持。
