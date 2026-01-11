# DragHandle DOMイベント化 + elementsFromPoint 化 (2026-01-11)

## 目的
- block-handle の点滅 / DnD 失敗の根因となる `posAtCoords` 依存を排除する。
- ProseMirror の `handleDOMEvents` に依存せず、DOMイベントで drag/move を直接監視する。
- indentBlock 廃止後の「DOM平坦化」前提で target 解決を最適化する。

## 変更概要
- `inlineDragHandleExtension.ts`
  - `posAtCoords` / `clampToContent` / `indentBlock` 参照を削除。
  - `elementsFromPoint` + `posAtDOM` による hit-test へ全面移行。
  - DOMイベント (mousemove/mouseleave/dragover/drop/keydown) を `editor-container` に直接登録。
  - 事前に `view.dom` の rect に clamp し、ガター上でも安定してターゲット解決できるようにした。
  - listItem DnD の drop 座標解析も `elementsFromPoint` ベースに変更。

- `blockHandlesExtension.ts`
  - `<!-- inlineMark:indent=N -->` の方針に合わせ、
    新規ブロック挿入時に「直前ブロックの indent 属性」を引き継ぐように調整。
  - スラッシュコマンドでブロック型変換した場合も、indent を維持するように設定。

## 設計ポイント
- `elementsFromPoint` で取得した DOM から `posAtDOM` を使い、
  ResolvedPos から allowed node を引き当てる構成。
- ガター領域でも target 取得できるように `view.dom` rect 内へ座標を clamp。
- 失敗時は WARNING/ERROR を出し、フォールバックで隠さない。
- Dropcursor 補正は既存の list DnD 処理を維持し、座標取得のみ置換。

## o3MCP 相談結果
- `mcp__o3__o3-search` が `Invalid value: 'xhigh'` で失敗。
- 相談文を短くして再試行したが同じエラーで復旧できず。
- 本件は一次情報 + 既存実装前提で設計継続。

## 残確認
- listItem DnD で dropX に応じた sink/lift が確実に動作するか。
- block-handle の点滅が「下階層」でも解消されているか。
- `ol` が `1. 1. 1.` になる問題が DOM 平坦化で解消されるか。
