# コメントメタ型インデント設計 (2026-01-10)

## 目的
- 「indentは必要な範囲のみ」にし、全ブロックへ属性を付けない。
- コメント開始〜終了までをインデント対象範囲にする。
- Markdown入出力はコメントメタで往復可能にする。
- 最大10段、リスト階層は別管理。

## コメント構文
- 開始: `<!-- inlineMark:indent=N -->` (Nは1..10)
- 終了: `<!-- /inlineMark:indent -->`
- コメントは単独行として扱う（前後の空白は許容）。
- コメント範囲内にブロックを追加すれば、そのブロックは自動でインデント対象。

## 実装方針
### 1) indentBlock ノード（ラッパー）
- `group: 'block'`, `content: 'block+'`, `defining: true`, `isolating: true`
- `attrs.level` のみ保持（1..10）
- renderHTML は `div.indent-block[data-indent="N"]`
- CSSで段数ごとに `padding-left` を付与

### 2) Markdownトークナイザ
- @tiptap/markdown の `markdownTokenizer` を使用
- `<!-- inlineMark:indent=N -->` から `<!-- /inlineMark:indent -->` までを 1トークン化
- ネストコメントは depth カウントで処理
- fenced code block 内のコメントは無視（誤検出回避）
- 終了コメントが無い場合は ERROR ログで明示（フォールバックなし）

### 3) parseMarkdown / renderMarkdown
- parse: `indentBlock(level)` に変換し、`helpers.parseChildren(token.tokens)` を中身に入れる
- render: コメント開始→子ノード→コメント終了で出力

## 操作系（Tab / Menu / DnD）
- Tab/Shift-Tab:
  - listItem の場合は従来の sink/lift を使用
  - それ以外は indentBlock の level を増減
- block-context-menu:
  - listItem には list indent/outdent
  - 非list には indentBlock / outdentBlock

## ハンドル表示の再検討
- mouseleave で即非表示になる問題に対して、
  - editor の rect + block-handle-gutter を「安全域」として判定
  - 安全域内なら非表示にしない
  - ログに安全域/座標を出力して原因追跡可能に

## 影響ファイル
- `packages/webview/src/editor/indentBlockExtension.ts` (新規)
- `packages/webview/src/editor/commands.ts`
- `packages/webview/src/editor/listIndentShortcuts.ts`
- `packages/webview/src/editor/blockHandlesExtension.ts`
- `packages/webview/src/editor/createEditor.ts`
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`
- `packages/webview/src/editor/icons.ts`
