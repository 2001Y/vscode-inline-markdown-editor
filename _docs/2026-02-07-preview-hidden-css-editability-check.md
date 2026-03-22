# 2026-02-07 Preview表示中の元テキスト露出 / 編集可否 / シェル統一の確認

## 事象
- Mermaid/HTML プレビュー表示中に、元テキスト（code/pre）が同時表示される。
- 不明ブロック・直書きHTML・Frontmatter・画像で見た目統一に揺れがある。
- 「編集できない」ように見えるケースがある。

## 原因
1. `block-preview-content-hidden` の `display: none` が CSS 優先度で負けるケースがある。
   - `pre.code-block > code` に `display: block` を付与するセレクタの方が強く、
     プレビュー中でも code が表示される。
2. RAW ブロックの点線境界が `data-kind` を見ずに常時適用される定義になっていた。
3. 画像の角丸は `img` とラッパーで適用経路が分散し、見た目が揺れる余地があった。

## 実施した修正
- `packages/webview/src/styles.css`
  - プレビュー中非表示セレクタを強化し、
    `pre.code-block > code.block-preview-content-hidden` /
    `pre.frontmatter-block > code.block-preview-content-hidden` を明示追加。
  - RAW ボーダーを `data-kind` で分岐:
    - `html` はボーダーなし
    - `html` 以外（不明ブロック）は点線ボーダー
  - `pre.raw-block-content` の padding を共通変数へ統一。
  - `.image` の `overflow` を `hidden` にし、`.image > img` に `border-radius: inherit` を追加。

## 編集可否の確認メモ
- Tiptap NodeView は `contentDOM` を返していれば通常編集可能（ProseMirror 管理領域）。
- 本実装の `stopEvent` も、編集領域そのものを止める実装ではなく、
  ラベル/ツールバー操作のみに限定されている。
- よって「編集不能」の主因は NodeView 仕様よりも、
  プレビューと元テキストが同時表示される UI 乱れによる認知的なものと判断。
