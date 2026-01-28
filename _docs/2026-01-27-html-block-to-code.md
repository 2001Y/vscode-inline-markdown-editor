# HTML blocks → code blocks

## 方針
- HTML ブロックはレンダリングせず、code block として表示する。
- HTML ブロック専用の NodeView / DOMPurify / CSS を削除。
- `renderHtml` 設定も削除。

## 変更点
- `HtmlBlock` 拡張を削除。
- `HtmlToCodeBlock` 拡張を追加（Markdown の html トークンを code block に変換）。
- `inlineMark.security.renderHtml` を削除。
- README / 設定 / テストを更新。

## 影響
- HTML ブロックは ` ```html ` のコードブロックとして編集・シリアライズされる。
- HTML を DOM としてレンダリングしない。
