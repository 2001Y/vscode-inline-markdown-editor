# Git diff / ハイライト対応メモ（inlineMark）

## 一次情報（VS Code API）
- Quick Diff API（SourceControl.quickDiffProvider）
  - 差分元のリソース URI を `provideOriginalResource` で返す。
  - `workspace.registerTextDocumentContentProvider` と併用して元内容を供給する。
  - エディタのガター差分表示（quick diff / inline diff）に使われる。
- CustomTextEditorProvider
  - TextDocument をデータモデルにし、WebviewPanel が UI を持つ。
  - Webview 内の表示は拡張側で明示的に実装する必要がある。

## 現状（このリポジトリ）
- CustomTextEditorProvider 実装: `packages/extension/src/editors/inlineMarkProvider.ts`
- Webview のエディタは Tiptap（ProseMirror）で実装: `packages/webview/src/editor/createEditor.ts`
- Decoration の利用例: `packages/webview/src/editor/inlineDragHandleExtension.ts`
- Markdown 差分生成は diff-match-patch を使用（G5-lite）: `packages/webview/src/editor/diffEngine.ts`

## 対応方針（選択肢）
1) VS Code 標準の quick diff を使う
   - QuickDiffProvider で差分元の URI を返し、TextDocumentContentProvider で内容を返す。
   - これは TextEditor 向けの差分表示であり、Webview には自動反映されない点に注意。
2) inlineMark Webview 内で差分ハイライトを実装する
   - Extension 側で Git の差分元（例: HEAD / index / last saved）を取得。
   - 差分を行・文字範囲に変換して Webview に送信。
   - Tiptap/ProseMirror の DecorationSet で inline/line ハイライトを描画。
   - 再計算タイミング（保存時、onDidChangeTextDocument、SCM 更新）を明確化。
3) 補助 UI を追加する
   - 「Diff を開く」などのコマンドで VS Code 標準の差分ビューへ誘導。

## 次の検討ポイント
- 差分基準の決定（HEAD / index / last saved）。
- ハイライト表現（背景色/左バー/下線）とテーマ適応。
- パフォーマンス（再計算頻度、差分サイズ上限）。
