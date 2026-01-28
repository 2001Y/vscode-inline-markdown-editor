# 2026-01-19 コピー時の Markdown 反映

## 目的
- コピー操作で、表示内容に対応した Markdown をそのままクリップボードへ出力する。

## 実装方針
- BlockHandles のコンテキストメニュー「コピー」を Markdown 直列化に切り替え。
- listItem は単体では doc として不正になるため、親 list を推定して list ラッパーを付与。
- 失敗時は WARNING ログで即時可視化。

## 変更点
- `blockHandlesExtension.ts`
  - `serializeBlockForClipboard()` を追加
  - copy アクションで `serializeMarkdown()` を使用
  - 成功/失敗をログ出力

