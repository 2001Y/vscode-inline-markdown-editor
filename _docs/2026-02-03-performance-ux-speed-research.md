# 2026-02-03 高速化調査（ロジック/UX）

## 目的
- inlineMark の体感速度（入力/スクロール/ドラッグ/検索/再同期）を改善する。
- フォールバック禁止・完全ログ主義を維持しつつ、ホットパスの無駄を削る。

## 追加前提（ユーザー回答 2026-02-03）
- 大量ブロックは 5,000〜10,000 を想定。
- ハンドルはホバー時のみ表示。実装は「ブロックごとに要素を設置し、CSSで表示制御」になっている認識。
- 外部編集（テキストエディタ側変更）は原則行われない想定。

## 調査範囲
- Extension: `packages/extension/src/editors/inlineMarkProvider.ts`、`packages/extension/src/util/textEdits.ts`
- Webview: `packages/webview/src/main.ts`、`packages/webview/src/editor/createEditor.ts`、`packages/webview/src/protocol/client.ts`、`packages/webview/src/editor/inlineDragHandleExtension.ts`、`packages/webview/src/editor/blockHandlesExtension.ts`、`packages/webview/src/editor/findWidget.ts`、`packages/webview/src/editor/diffEngine.ts`、`packages/webview/src/styles.css`
- 既存設計/方針: `_docs/詳細設計.md`、`_docs/2026-01-14-block-wrapper-implementation.md`
- 一次情報: ProseMirror公式のDecorationSet運用指針、VS Code WebviewのretainContextWhenHidden注意点、diff-match-patchのDiff_Timeout/Diff_EditCost

## 重要な現状観測（ボトルネック候補）
- Webview側で console ログが常時大量に出力されている。
- `inlineDragHandleExtension` が `props.decorations` で毎回 `doc.descendants` を走査し、全ブロックに `Decoration.widget` を生成する。
- `createEditor.ts` の `onUpdate` で `editor.getMarkdown()` → diff-match-patch を毎回実行。
- `applyChanges` は docChanged を受けたら `setContent` による全文再構築。
- `main.ts` の MutationObserver が毎回全 `img` を走査して resolve する。
- `findWidget.ts` が `transaction` / 検索操作で大量ログを出力し、マッチ算出も都度フル走査。
- `styles.css` の `content-visibility: auto` は入っているが、ハンドル表示のため `block-handle-host` 等で無効化しており効果が削がれる可能性。
- Extension側は `handleEdit` で `document.getText().length` を毎回取得して ChangeGuard メトリクスを計算。

## 質問への回答まとめ（要点）
- デバッグ設定の確認頻度: `packages/webview/src/editor/debug.ts` は `localStorage` を毎回読む実装であり、ログ呼び出しごとにチェックが走る。`SyncClient.log()` は `config.debug.enabled` のブール参照のみだが、`main.ts` 等の `console.*` は無条件出力。結論としてホットパスでの「毎度チェック/毎度出力」が混在しているため、単一ロガーで初期/設定変更時にフラグを更新し、出力前の早期returnを徹底した方が良い。
- `DecorationSet.map` のデメリット: 位置マッピングは効率的だが、装飾の「追加/削除ロジック」を別途持たないと古い装飾が残る。装飾数が多い場合は map 自体のコストも大きい。Widgetの内容がノード内容に依存する場合は、map だけでは更新されず再生成が必要。
- ハンドル要素を1つにする案: 現状は「各ブロックに widget を埋め込み、CSSで hover 表示」。提案は「単一オーバーレイDOM」または「アクティブブロック1件だけのDecoration」に変えるという意味。UXは同等にしつつ、要素数を O(N)→O(1) に近づける。
- MutationObserver と IntersectionObserver: いまの全件走査はシンプルだが最悪ケースで重い。IOは「表示されたときに解決する」方式なので遅延許容が前提。IOだけでは新規画像の検知ができないため、結局「追加検知（MutationObserverまたはNodeView）」が必要。最もクリーンなのは画像NodeViewでのresolve管理だが実装コストは上がる。
- ChangeGuard の目的: 「バグらない実装」に置き換えるためではなく、バグや想定外入力が起きたときに“即エラーで顕在化させて破壊的変更を止める”ための安全弁。設計方針（フォールバック禁止・失敗は即エラー）に合致する。削除するより「発火条件とエラー表現の整理」が妥当。
- docChanged 送信対象の意味: 「同一ドキュメントのWebview panelにのみ送る」という意味。現状 `documentStates` で doc 単位に限定されているため、主な改善余地は micro-batch と送信頻度の抑制。
- 全文シリアライズ + 文字列diffの理由: G5-lite方針で「全文置換による再整形」を避けるため。Tiptap/Markdown 変換が全文出力である以上、最小差分を得るには文字列diffが最も単純で堅い手段だった（`README` と `詳細設計.md` の方針）。

## 既存設計との整合メモ
- `_docs/詳細設計.md` では「完全ログ主義」「フォールバック禁止」「ChangeGuard」「疑似仮想化（content-visibility）」が前提。
- `_docs/2026-01-14-block-wrapper-implementation.md` で「大量ブロック時のNodeViewパフォーマンス」リスクを明示。

## 即効性の高い改善（P0〜P1）
- ログのレベル連動とリングバッファ化。
- DecorationSetのキャッシュ化（docChanged時のみ再計算）またはハンドル表示を「アクティブブロックのみ」に縮退。
- MutationObserverの差分処理とバッチ化（追加/変更されたサブツリーだけ処理）。
- ChangeGuard計算の `document.getText()` 依存を外し、長さの増分更新でO(N)を回避。
- docChanged送信は対象URIのpanelに限定し、短時間の変更はmicro-batch。

## 中期の再設計候補
- “全文Markdownシリアライズ+文字列diff”から、ブロック単位のインクリメンタル更新へ。
- ドラッグハンドルをDecorationから独立した単一オーバーレイUIへ。
- 画像解決をMutationObserverではなく画像NodeViewで管理。

## リスク/トレードオフ
- ログ抑制は「完全ログ主義」と衝突しやすいので、通常は集計ログ+閾値超えのみ詳細ログ、障害時はリングバッファを吐き出す方式が安全。
- ハンドル表示を“1ブロックのみ”にする場合はUXの期待値と要調整。
- diff計算のワーカー化やフルコンテンツ送信は同期ロジックと整合させる必要がある。

## 追加の確認事項（UX要件）
- 同期の遅延許容（200ms以内 / 500ms〜）の期待値。

## 参考ファイル
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/editor/blockHandlesExtension.ts`
- `packages/webview/src/editor/createEditor.ts`
- `packages/webview/src/main.ts`
- `packages/webview/src/editor/findWidget.ts`
- `packages/webview/src/editor/diffEngine.ts`
- `packages/webview/src/styles.css`
- `packages/extension/src/editors/inlineMarkProvider.ts`
- `packages/extension/src/util/textEdits.ts`
