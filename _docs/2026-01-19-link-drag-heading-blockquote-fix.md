# 2026-01-19~20 Link/Drag/Heading/Blockquote Fix

## 背景
- ドラッグ移動が成立しない（dragstart/dragover ログは出るが移動されない）。
- 見出しハンドルのレイアウトが他と異なり、横並びが崩れて見える。
- 引用ブロックの余白調整が不自然。
- リンクは通常クリックで開かず、Cmd/Ctrl 時のみポインター表示＋リンクオープンにしたい。

## 調査
- Tiptap docs で editorProps / link openOnClick / clipboardTextSerializer の挙動を確認。
- o3MCP にドラッグ失敗の原因仮説と修正案を問い合わせ（イベント伝播・view.dragging・drop 未発火の可能性）。

## 修正内容
### ドラッグ移動
- `onDragEnd` で `dragSelectionRange` と `view.dragging` を先にクリアしていたため、
  drop 未発火時の `applyManualDrop` が必ず失敗していた。
- クリア順序を変更し、`applyManualDrop` 実行後に `dragSelectionRange` / `view.dragging` を解放。
- DataTransfer の `text/plain` が空になると WebView で drop が無視されやすいため、
  空の場合は `' '` を必ずセット（fallback をログ付きで明示）。
- drag end ログに `dropHandled`, `hasRange`, `hasDragging`, `lastTarget/coords` を追加。

### リンク
- `editorProps.handleDOMEvents.click` でリンククリックを一元処理。
- **常に** `preventDefault()` + `stopPropagation()` し、
  Cmd/Ctrl 押下時のみ `openLink` を実行。
- ポインター表示は既存の modifier クラス切替（keydown/keyup/blur）を継続。

### 見出し・引用
- 見出しのハンドル位置を `top: 0.2em` で微調整し、見出し文字と横並びに見える位置へ調整。
- 引用ブロックの `margin/padding` を縮小し、左余白の過剰感を緩和。

## 変更ファイル
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/editor/createEditor.ts`
- `packages/webview/src/styles.css`

## 追加ログ
- `[INFO][InlineDragHandle] Drag end` に drag 失敗解析用の状態を付加。
- DataTransfer の `plainTextLength` / `usedPlainTextFallback` を記録。

## メモ
- さらなる drag 失敗時は、capture フェーズの drop ログ追加で「drop未発火」か「drop処理失敗」かを判別可能。

## 追加修正 (2026-01-19)
- dragstart 時に editor.view.focus() を強制し、選択/ドラッグの前提を固定。
- dragend のフォールバック適用時に dragend の座標を使えるように補完。
- document dragover/drop で lastDragOverCoords/Target を更新して drop 未発火時の解析を強化。
- 見出しの左寄せは `h1..h6` の `padding: 0` が `.block-handle-host` の padding-left を打ち消していたため削除。
- 外部リンク確認/ブロック等のメッセージを l10n に追加（英/日/中）。

## 追加変更ファイル
- `packages/extension/l10n/bundle.l10n.json`
- `packages/extension/l10n/bundle.l10n.ja.json`
- `packages/extension/l10n/bundle.l10n.zh-cn.json`
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`

## CodeRabbit対応
- Markdown manager 未取得時の notify を一度だけに抑制（重複通知防止）。
- package.nls の "TipTap" を "Tiptap" に修正。

## 追加変更ファイル（CodeRabbit対応）
- `packages/webview/src/editor/markdownUtils.ts`
- `packages/extension/package.nls.json`

## 追加修正 (2026-01-20)
- dragend フォールバックで `view.dragging` が消えている場合に備え、dragstart の slice を保持して使用。
- 引用ブロックのテキスト位置を他ブロックに合わせるため `margin-left: -0.5em` を追加。
- 外部リンク確認ダイアログの「Cancel」二重表示を避けるためボタンは「Open」だけに変更。

## 追加変更ファイル
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`
- `packages/extension/src/editors/inlineMarkProvider.ts`

## CodeRabbit対応 (追加)
- debug.ts の group/groupEnd で groupDepth を管理し、デバッグ切替時の未閉じグループを防止。
- hostNotifier の fallbackLog をレベル別 console に分岐。
- htmlBlock の stopEvent DOM判定を Element に修正。
- nestedPage の allowedAttributes に indent を追加。
- rawBlock の destroy ログで最新 node を参照。
- indentMarkerExtension の重複ログを整理。
- tableControls の日本語ハードコードを i18n 化。
- protocol/types の docs に menuStateChange / nestedPageCreateAck を追記。
- テストフィクスチャの日本語/記号修正。
- _docs/2026-01-15-package-latest-deps.md に @types/dompurify と npm audit の解決を書き足し。

## 追加修正 (2026-01-20)
- document drop/dragend が `view.dragging` 消失で拾えないケースに備え、`dragSelectionRange` / `dragPayload` を基準に補足するように変更。
- 引用ブロックの左寄せが残っていたため、`margin-left` の相殺を削除して他ブロックと揃えた。
- 外部リンク確認は VS Code 標準のリンクオープナーに委譲し、二重キャンセルを解消。
- ブロックハンドル (+/6点) のタイトルを i18n 化。

## 追加修正 (2026-01-20 追記)
- **dragstart 内の view.dispatch を廃止**し、DOM再レンダリングによるドラッグ中断を回避。
  - `NodeSelection` をローカル生成して slice を作成し、`view.dragging` に投入。
  - 移動時の削除は `dragSelectionRange` を用いて `tr.delete(from, to)` で行う。
  - `dragover/dragend` の document 監視は `dragSelectionRange/dragPayload` 基準で継続。
- blockquote は `.block-handle-host` に対して **padding-left/right を明示**してズレを抑制。

## 追加変更ファイル (追記)
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`

## 追加変更ファイル
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`
- `packages/extension/src/editors/inlineMarkProvider.ts`
- `packages/webview/src/editor/blockHandlesExtension.ts`
