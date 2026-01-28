# UIコントロール/ドラッグ/テーブル移動 調査メモ (2026-01-09)

## 参照した一次情報
- Tiptap Table 拡張のコマンド: addRowBefore/addRowAfter/deleteRow, addColumnBefore/addColumnAfter/deleteColumn（公式ドキュメント）
- prosemirror-tables の moveTableRow / moveTableColumn コマンドが提供されている（README）
- TableMap により行/列とセル位置を相互変換できる

## ドラッグ移動の正攻法
- ブロック移動は「NodeSelection → Slice → dropPoint → replace」で実装するのが標準
- delete + insert で Fragment を挿すやり方は openStart/openEnd を落としやすく不整合を起こす
- Drop の合法位置は dropPoint で算出する

## 実装に反映した方針
- ブロックドラッグ: NodeSelection の Slice を dropPoint に基づいて移動
- テーブル行/列ドラッグ: moveTableRow / moveTableColumn を使って再配置
- テーブルUI: 選択中セルから行/列を特定し、ハンドルと + を連動表示

