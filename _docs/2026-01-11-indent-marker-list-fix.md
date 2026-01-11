# indent marker / list / Tab 修正メモ (2026-01-11)

## 目的
- 非リストの Tab/Shift-Tab でクラッシュしていた原因を解消する。
- list 内部に indent marker が混入して `ol` が `1. 1. 1.` になる問題を抑制する。
- ネストした list の DragHandle が親判定になる症状を軽減する。

## 変更概要
- `commands.ts`
  - `Selection.map` に `tr.doc` を渡していなかったため例外になっていた。
  - `selection.map(tr.doc, tr.mapping)` に修正。
  - mapping 失敗時は ERROR ログで明示し、クラッシュを回避。

- `indentMarkerExtension.ts`
  - `<!-- inlineMark:indent=N -->` のトークナイズは **行頭 (列0)** のみ対象に限定。
  - list item 内のインデントコメントを拾わないことで、list 分断を抑制。

- `disableKeyboardShortcuts.ts` / `rawBlockExtension.ts` / `htmlBlockExtension.ts`
  - `renderMarkdown` に context を渡し、**parent が listItem の場合は indent marker を出力しない**。
  - list 内部にコメントが混入して list が分断される現象を抑制。

- `inlineDragHandleExtension.ts`
  - listItem の位置解決を `elementsFromPoint` + `resolveListItemPosFromElement` に統一。
  - ネスト list では **深い listItem を優先**するように判定ロジックを更新。
  - Debug モード時に elementsFromPoint の sample 情報を出力。
  - DnD の list インデントが最大深度を超える場合に VS Code 通知を出す。

- `commands.ts`
  - list の最大深度を 2 に固定し、超過時は VS Code 通知で警告。

## 期待される挙動
- Tab/Shift-Tab のブロックインデントがクラッシュせず動作。
- list 内の indent marker が除去され、`ol` の番号が 1,2,3 で安定。
- ネスト list の DragHandle が親判定になりにくい。

## 残確認
- `ol` の `1. 1. 1.` が実際に消えるか UI 確認。
- ネスト list で handle が正しい listItem を掴めるか UI 確認。
