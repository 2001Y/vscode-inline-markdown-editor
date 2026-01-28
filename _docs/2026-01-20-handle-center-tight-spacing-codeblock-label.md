# 2026-01-20 Handle Center + Tight Spacing + CodeBlock Label Edit

## 依頼
- ハンドル位置を上下中央に揃える。
- 見出しのジャンプ率を抑え、全体の行間を詰める（リスト除外）。
- code-block のラベル（block-label code-block-label）を編集可能にする。
- Markdown の code fence 情報は `language:filename` 形式に統一する。

## 実装方針
- CSS の `.block-handle-container` を `top: 50%` + `translateY(-50%)` に統一。
- 見出しマージンと本文の line-height を縮め、段差感を抑制。
- code-block NodeView のラベルを `contenteditable=true` とし、blur/Enter で attrs 更新。
- parse/render の両方で `language:filename` を採用し、旧 `filename=` は暫定的に許容。

## 変更点
- `packages/webview/src/styles.css`
  - `.block-handle-container` を上下中央配置。
  - 見出しマージン/行間を縮小。
  - `.inline-markdown-editor-content` と `.html-block-content` の line-height を詰める。
  - 段落/blockquote の下余白を縮小。
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
  - code block ラベルを編集可能にし、`language:filename` で同期。
  - Markdown の parse/render で `language:filename` を使うように更新。

## 注意
- ラベル編集は `stopEvent` により ProseMirror 側の入力を遮断。
- `language:filename` 形式は `:filename` 単独も許容し、言語未設定を明示できるようにした。
