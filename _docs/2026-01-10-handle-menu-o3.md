# DragHandle / Menu 統合の相談メモ（o3）(2026-01-10)

## 相談背景
- listItem のハンドルが `ul/ol { padding-left: 2em; }` の `::marker` と被る。
- テーブルセル内のハンドルは左ではなく下に配置したい。
- テーブル行/列ハンドルの DnD が動作しない。
- block-type-menu と block-context-menu のスタイル/キー操作を統一したい。

## o3回答の要点
### listItem の ::marker 競合解消（候補）
A. listItem の “最初のコンテンツ要素” をアンカーにして left-start 配置（レイアウト変更なし）
B. listItem の padding-left を読み、ハンドルを左へオフセットして marker から退避
C. ハンドル表示時に CSS で list の左ガターを増やす（レイアウト変化が出る）

### テーブルセル内ハンドル
- `td/th` 内にいる場合は `bottom-start` へ切替、**下方向に 4px オフセット**で配置。

### 行/列 DnD
- `moveTableRow / moveTableColumn` は **コマンド関数**なので `command(state, dispatch)` で実行が必要。
- `pos` は必ず **テーブル内のセル位置（cellStart + 1）** を渡す（例: `anchorCellPos`）。

### メニュー統合
- block-type / block-context を同じ DOM/CSS/キー操作の “BlockMenu” で統一。
- 表示/非表示、選択更新、キー操作（↑/↓で移動、Enterで確定、Escapeで閉じる）を共通部品化。

## 採用方針（実装判断）
### listItem 採用方針（B）
- list の left と listItem の left 差分を `offsetX` として計算し、**handleX = computedX - offsetX**。
  - `offsetX <= 0` または取得不能の場合は ERROR ログ → ハンドル非表示で終了。
- marker の位置に依存せず、レイアウト変更なしで重なりを避ける。
- テーブルセル: `bottom-start` + 小さな下方向オフセットで配置。
- 行/列 DnD: `moveTableRow/Column` のコマンド実行に修正。
- メニュー: `.block-menu` 共通スタイル + 共通ロジックに統合。

## 追加メモ（非フォールバック方針）
- list offset / cell pos が取れない場合は **ERROR** ログを出し、ハンドル/操作は中止（非表示）。
- fallback で「とりあえず動かす」は避ける。
