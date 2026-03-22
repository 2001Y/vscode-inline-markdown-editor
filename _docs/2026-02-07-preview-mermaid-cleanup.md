# 2026-02-07 Preview / Mermaid Cleanup

## 目的
- Mermaid/直HTML プレビューの不安定化要因を削除
- iframe クリック編集モードを廃止し、トグルのみで編集/プレビューを切替
- Mermaid 上書きCSSの過剰性（`!important` 多用）を解消
- 画像/テーブル/ラベルの見た目整合を改善

## 変更
- `packages/webview/src/editor/blockPreview.ts`
  - iframeクリックで編集へ戻す挙動を削除
  - blurで自動的にプレビュー復帰する挙動を削除
  - Mermaid iframe CSSの `!important` 群を撤去
  - HTML iframeのベースCSSを整理（margin/box-sizing/dialog/input等）
  - 高さ計測で `scrollHeight` の過大評価を抑制

- `packages/webview/src/styles.css`
  - `--block-label-bg` を `--vscode-editorIndentGuide-background` に統一
  - リンクカーソル定義の `!important` を削除
  - 画像ノード（`.image`）にもコードブロック同等の角丸クリップを適用
  - テーブルを `border-collapse: collapse` + ラッパー境界で角丸に再定義
  - プレビュー時の非表示クラスを高特異度セレクタ化し `!important` 依存を解消

## 検証
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test` ✅
- `npm run package` ✅

## 補足
- `styles.css` 上の `!important` は `dropcursor` の `position` 1箇所のみ残存（公式プラグイン表示位置の固定のため）。
