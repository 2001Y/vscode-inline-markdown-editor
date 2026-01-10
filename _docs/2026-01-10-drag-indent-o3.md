# Drag + インデント移動のo3相談メモ (2026-01-10)

## 現状実装の前提
- InlineDragHandle（自作）で dragstart 時に NodeSelection を作成し、`view.dragging = { slice, move: true }` をセット。
- drop は ProseMirror の既定挙動に委譲（カスタム drop handler なし）。
- Dropcursor は公式拡張。
- listItem は allowedNodeTypes に含めているが、インデント深度をドラッグで変える仕組みは未実装。

## 要望
- ドラッグ移動時に **リストのインデント深度も移動/調整** できるようにしたい。
- モダン/公式寄りでシンプルな実装を選びたい（フォールバックなし、ログ明示）。

## o3 提案（要約）
### Option 1: 既定 drop の後にインデントを正規化（推奨）
- dragstart で listItem を **親リストでラップ**した slice を用意（リスト構造を保持）。
- drop は既定処理に任せる。
- drop 後に `sinkListItem/liftListItem` を繰り返し、
  - `startX` と `dropX` の水平差で深度 delta を計算
  - もしくは drop 位置の list 深度を基準に調整
- 長所: 実装が最小、既定D&Dを崩さない。
- 短所: drop 後に挿入範囲を正確に特定する必要あり。

### Option 2: listItem の drop を自前で制御（確実・重い）
- `handleDrop` を listItem だけ上書きし、dropPoint で挿入位置計算。
- delete + insert + 深度調整を 1 トランザクションで実行。
- 長所: 決定的。
- 短所: 既定D&Dの挙動を再実装する必要があり重い。

### Option 3: drag中に slice を“ネスト構造付き”に更新
- dragover 中に `view.dragging.slice` を再構成して深度を反映。
- 長所: drop 後の調整不要。
- 短所: drop 位置の制約と合わず破綻しやすい。

## 推奨案
- **Option 1** を第一候補。
  - dragstart: listItem を親listで包んだ slice をセット。
  - drop: default 処理後に depth を補正。
  - 正規化の失敗は ERROR/WARN ログ。

## 実装のメモ（具体アルゴリズム）
- **深度delta計算**: `deltaDepth = Math.round((dropX - startX) / indentUnitPx)` を採用。
  - `indentUnitPx = 24` を基準にする（LIST_INDENT_STEP_PX）。
  - サブピクセル誤差は `Math.round` で吸収（必要なら `+ 0.001` のepsilonを追加）。
  - `desiredDepth = Math.max(1, sourceDepth + deltaDepth)` に clamp。
- **挿入範囲の検知**: drop後の selection から **最も近い listItem の先頭**を1件だけ特定して補正。
  - `findNearestListItemPos(doc, selection.from)` で親方向に探索。
  - listItem が見つからなければ ERROR ログで停止（フォールバックなし）。
- **適用単位**: 現状は **単一 listItem** の深度のみを補正（「listItem単位」要件に合わせる）。
  - 複数項目の連続ブロック調整は未対応（必要なら contiguous range で拡張）。
