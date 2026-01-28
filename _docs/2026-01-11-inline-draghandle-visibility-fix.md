# InlineDragHandle 非表示問題 調査/修正メモ (2026-01-11)

## 目的
- editor.view.dom 配下に移動した InlineDragHandle が表示されない問題を解消する。
- dragover/dropcursor/listItem DnD の安定化方針は維持する。

## 調査メモ
- ProseMirror は view.dom の中身を viewdesc が管理しており、**未知の DOM を直接 append すると更新時に除去される可能性が高い**。
- `data-pm-ignore` は prosemirror-view では参照されておらず、**無効な前提**になっていた。
- `handleDOMEvents` は ProseMirror 側で動的に listener を追加するが、**eventBelongsToView は pmViewDesc.stopEvent を参照**するため、widget なら止められる。
- `pointer-events: none` を wrapper に付けると **子要素がインタラクティブにならない**ため、表示しても操作できなくなる。
- indentBlock の影響は既存の `resolveIndentBlockTarget` で一次対応済み（ただし座標近傍探索は未対応）。

## 今回の修正方針
- **editor.view.dom 配下に置く要件を満たしつつ、ProseMirror に正しく管理させる**ため、`Decoration.widget` を用いて handle layer をマウント。
- wrapper の `pointer-events` は **非表示時は none / 表示時は auto** に切り替え。
- mousemove が同一 pos の場合でも **非表示なら再表示**できるように修正。
- dragend 後は `currentNodePos` をリセットして **再表示を確実化**。
- マウント/デタッチは INFO/SUCCESS/ERROR でログに残す。

## 実装概要
- `inlineDragHandleExtension.ts`
  - `Decoration.widget(0, wrapper, { key, ignoreSelection, stopEvent })` を使って handle layer を挿入。
    - `stopEvent` は **mousemove を通す条件付き**にする（例: `mousedown/click/dragstart` のみ stop）。
  - `editor.view.dom.appendChild(wrapper)` を廃止。
  - `showHandle`/`hideHandle` で wrapper の pointer-events を制御。
  - `mousemove` で `handleVisible` を見て再表示。
  - `dragend` で `currentNode`/`currentNodePos` をリセット。

## 残リスク / 次の確認
- **stopEvent を条件付きにした場合の副作用**（選択/ドラッグ挙動）が残るため要検証。
  - mousemove が ProseMirror に届くこと（`handleVisible` 再表示が動くこと）
  - click/dragstart で selection が暴れないこと
- indentBlock の内部で **座標近傍のブロックを拾う精度**がまだ不足する可能性あり。
- 実機で **Chrome MCP の console/network/trace** を見て動作確認が必要。

## 外部調査
- Context7 で ProseMirror view docs を確認したが、`handleDOMEvents`/`posAtCoords` の実務情報は不足。
- o3 MCP は `Invalid value: 'xhigh'` エラーで実行不能（相談方法変更も失敗）。
