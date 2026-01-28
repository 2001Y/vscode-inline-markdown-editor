# Dropcursorインデント表示 / Tabインデント修正メモ (2026-01-10)

## 目的
- Tab/Shift-Tab で listItem のインデントが効かない問題を根治。
- 既存 Dropcursor の「線」そのものをインデント分だけ横にずらして視覚化（追加ガイド線は作らない）。
- DragHandle を editor.dom 内に置き、dragover 判定と Dropcursor の整合を改善。
- block-context-menu にインデント操作を追加。

## 一次情報 (Context7 / Tiptap)
- Dropcursor は class / color / width のみが公式 API。線の位置は CSS/DOM 側の補正が必要。 (tiptap-docs)

## o3 フィードバック要点
- Tab/Shift-Tab の失敗は NodeSelection などで listItem 内の TextSelection になっていないことが原因になりやすい。
- 先に listItem 内への Selection 正規化を行い、sink/lift を実行するのが最小修正。
- Dropcursor の横オフセットは dragover で rAF 集約し、既存線を動かすだけに留める。
- DragHandle を editor.dom 内に置くと dragover 伝播が安定。data-pm-ignore + contenteditable=false 推奨。

## 実装方針
1. commands.ts
   - listItem 近傍探索で listItemPos を求め、Selection を listItem 内へ正規化。
   - listItem が見つからない場合は ERROR で中断（フォールバック無し）。
2. blockHandlesExtension.ts
   - listItem の場合のみ context menu に indent/outdent を追加。
   - 既存 executeCommand を利用。
3. inlineDragHandleExtension.ts
   - DragHandle wrapper を editor.dom 直下に移動。
   - dropcursor 要素の left/width を dragover で調整し、インデント分の視覚化を行う。
4. styles.css
   - .inline-markdown-editor-content を position: relative に。
   - dropcursor の z-index を上げる。

## 影響ファイル
- packages/webview/src/editor/commands.ts
- packages/webview/src/editor/blockHandlesExtension.ts
- packages/webview/src/editor/inlineDragHandleExtension.ts
- packages/webview/src/editor/i18n.ts
- packages/webview/src/styles.css
