# 2026-01-16 ドラッグ/リンク/フロントマター修正メモ

## 背景
- 見出し/リストのドラッグ開始が失敗し `Handle target disallowed {type: 'text'}` が出る。
- ドロップカーソルがテキスト末端に出て移動できない。
- ネストページ作成初回（親ドキュメント移動あり）で作成ファイルが開かれない。
- frontmatter と `---` 区切りが競合。
- リンクは Cmd/Ctrl 押下時のみ開く/カーソルを変える。
- テーブル行列ドラッグの判定がテーブル外で止まる。

## 方針（最小・既定寄り）
- DnD は ProseMirror 既定動作に寄せ、**pos 解決のみ**正確にする。
- フォールバックで誤魔化さず、pos 解決不能時はエラーで顕在化。
- link は Cmd/Ctrl 押下時のみ pointer を出す。
- frontmatter は文頭限定で tokenize。
- table DnD は pointer capture + 座標クランプで全域追従。

## 対応内容
### 1) DragHandle pos 解決の安定化
- `data-block-pos` を信頼しすぎず、**DOM→doc pos を再解決**。
- `data-block-type` を使い、resolve 時に **該当ノードの開始位置**を再計算。
- text を拾った場合は **ERROR ログ**で即中断。

### 2) Drop のフォールバック解除
- 手動 drop が失敗したときは `preventDefault` をしない。
- ProseMirror 既定 drop にフォールスルーできるように修正。

### 3) Link の Cmd/Ctrl 限定 + カーソル
- `keydown/keyup/blur` で `body` に状態クラスを付ける。
- `a` の cursor を **Cmd/Ctrl 押下時のみ pointer** に変更。

### 4) Nested page 初回 open
- 親ドキュメント移動 (`needsRelocate`) が発生したケースは、
  **拡張側で `vscode.openWith` を直接実行**して開く。
- dispose 済みパネルへの postMessage を事前チェックし、
  **明示ログで失敗を可視化**。

### 5) Frontmatter 文頭限定
- `tokenize` で **既存トークンがある場合は即 reject**。
- BOM を許容し、文頭 `---` のみ frontmatter 扱いに限定。

### 6) Table DnD の判定範囲
- `pointermove` の座標を tableRect にクランプして `posAtCoords` へ。
- テーブル外でも boundary 判定が止まらないように調整。

## 影響範囲
- webview: InlineDragHandle / BlockHandles / TableControls / createEditor / styles / Frontmatter
- extension: InlineMarkProvider (nested page open)

## 検証ポイント
- 見出し/リストの dragstart が `NodeSelection` で始まるか。
- Dropcursor がブロック間に出るか。
- listItem の移動が成立するか。
- 初回 nested page 作成時でも作成ファイルが開くか（親移動あり）。
- 文中 `---` が frontmatter 判定されないか。
- Cmd/Ctrl 押下で a の cursor が pointer に変わるか。
- テーブル外で drag 中も boundary が更新されるか。
