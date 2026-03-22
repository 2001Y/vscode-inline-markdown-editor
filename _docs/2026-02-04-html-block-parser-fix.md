# 2026-02-04 HTMLブロック1件化の修正（Marked準拠）

## 背景
- `HtmlToCodeBlock` のカスタム tokenizer が HTML ブロックの境界を正しく切れず、
  **HTML開始後にドキュメント末尾まで飲み込む**挙動になっていた。
- これは「HTMLブロックが1件にまとまらない／過剰にまとまる」という違和感の原因になる。

## 方針
- **Marked（標準）の HTML block tokenizer をそのまま使う**。
- 独自の HTML 行判定・収集ロジックは削除し、標準挙動に委ねる。
- `HtmlToCodeBlock` は **HTML token を rawBlock(kind=html) に変換する責務のみ**に限定する。

## 変更点
- `packages/webview/src/editor/htmlToCodeBlockExtension.ts`
  - 独自の `markdownTokenizer` を削除。
  - `parseMarkdown` のみで HTML token → rawBlock 変換を実施。
  - デバッグログを追加（HTML token の block/length を記録）。
- `packages/webview/src/editor/rawBlockExtension.ts`
  - `:::raw` の **ネスト対応パーサのみ**を使用。
  - 旧正規表現フォールバックを削除（誤抽象の排除）。
  - 閉じ `:::` 不在時は ERROR ログで顕在化。

## 期待効果
- HTMLブロックが**1件の rawBlock**として安定して表示される。
- `:::raw` 内の `:::note` 等が正しくネスト扱いされ、分断されない。
- 標準仕様に沿った挙動に収束し、分岐/例外の温床を削減。

## 補足
- HTML inline は既存方針どおり block 化しない（schema 破壊回避）。
