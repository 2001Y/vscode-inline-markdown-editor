# 2026-01-19 DnD 不発対策 + 見出し/引用レイアウト調整

## 目的
- drop が発火しないケースでもドラッグ移動を成立させる
- 見出しハンドルの縦位置ズレを修正
- 引用ブロックの余白を適正化

## 対応内容
### 1) DragEnd での drop 強制適用（ERROR ログ付き）
- dragover で最終座標を保持し、drop が来ない場合に dragend で手動ドロップ
- フォールバック扱いだが **ERROR ログで明示**して問題を隠さない

### 2) 見出しレイアウト
- 見出しの `margin` を `.block-content` から `h1..h6` 要素へ移動
- ハンドルと見出し本文の縦位置ズレを解消

### 3) 引用ブロック余白
- blockquote の `.block-content` 左パディングを縮小
- ハンドルのガターと二重に余白が入る問題を緩和

## 変更点
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
  - dragover 最終座標の保持
  - dragend で drop 未発火時に手動ドロップ + ERROR ログ
- `packages/webview/src/styles.css`
  - 見出し margin の付け替え
  - blockquote の padding 調整

