# 2026-02-03 Find Widget 見た目改善 (VS Code 寄せ)

## 目的
- VS Code の Find/Replace UI にさらに近づける。
- プレースホルダー、置換ボタンのアイコン化、縦位置のズレ、多言語化を解消する。

## 対応内容
- `packages/webview/src/editor/findWidget.ts`
  - i18n を導入し、プレースホルダー/ツールチップ/ステータス文言を多言語化。
  - Replace/Replace All を Codicon のアイコンボタンに変更。
  - 行レイアウトを grid 化してボタン類の縦中央揃えを安定化。
  - Replace 行に spacer を追加し、Find 入力と左右揃え。
- `packages/webview/src/editor/i18n.ts`
  - `findWidget` セクションを追加（EN/JA/ZH）。
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - Webview HTML の `lang` を `vscode.env.language` で設定。
- `packages/webview/src/styles.css`
  - Find UI の grid レイアウト、プレースホルダー色、アイコンボタンの密度調整。

## 期待効果
- VS Code と同様の密度感と縦位置の揃いが安定する。
- 置換操作がアイコン表現になり VS Code に近づく。
- 言語設定に応じた UI 文言が表示される。

## 追加対応 (UI密度の再調整)
- 入力幅を固定し、Find/Replace で共通化。
- Replace/ReplaceAll 以外のボタンを入力背景内に配置。
- Preserve Case を置換入力内へ移動。
- Find in Selection を Close の左に配置。
- Replace/ReplaceAll の Codicon を追加し表示を修正。
- 検索移動時のスクロール追従を手動補正（scrollIntoView 補完）。

## 追加対応 (レイアウト再調整)
- 入力背景は textarea + toggle 群のみ（count/actions は外側）に変更。
- find-count の表示を `current/total` に変更（スペース削除）。
- 左側のネイティブリサイズハンドルを使用するため、`resize: horizontal` + `direction: rtl` を適用。
- アクションボタンはサイドカラムに移動し、縦方向にフルハイトで配置。

## 追加対応 (アクション配置/幅統一)
- toggle replace を左側の専用エリアへ移動（全高）。
- find-side-actions を行内に戻し、行高さに揃えた横並びに変更。
- find-main / find-row / input-group に flex を付与して count → actions 間の余白を安定化。
- 全アイコンボタンを固定幅・paddingなしに統一。
- widget の初期幅と最小幅を共通変数化。

## 追加対応 (微調整)
- find-layout を fit-content に変更。
- 初期幅/最小幅を 400px に統一。
- find-row-spacer を固定幅 10px に変更。
- 次/前アイコンを arrow up/down に変更。

## 追加対応 (列ラッパー再編)
- find-main を廃止し、toggle / group / meta / actions の4列構成に変更。
- find-input-group 2つを共通ラッパーで揃え、count/replace-actions も別ラッパーへ。
- selection などのボタン配置は side-actions に統一。

## 追加対応 (count整列/replace幅安定)
- find-count を div に変更し縦中央揃え。
- replace-actions は visibility で非表示にし幅を維持。
- replace-actions の最小幅を固定。

## 追加対応 (replace非表示/スクロール中心化)
- replace-actions は visibility hidden + height 0 で幅維持しつつ縦の伸びを抑制。
- replace 非表示時は meta-stack の gap を 0 に変更。
- 検索移動時のスクロールをビュー中央に寄せるよう補正。

## 追加対応 (gap/余白統一)
- find-widget 系の gap と padding を `--find-widget-gap: 4px` に統一。

## 追加対応 (検索ハイライトの選択解除)
- `Find next/prev` は selection を移動せず、active match のデコレーションで強調。
- 置換はアクティブ一致を直接置換する実装に統一（selection 変更を廃止）。
- スクロールは一致の中心位置に手動で寄せる。
- ハイライト色は `editor.findMatch*` の VS Code CSS 変数に統一。

## 追加対応 (トグル/ドラッグ)
- 置換トグルのデフォルトを `chevron-right` に変更し、展開時のみ `chevron-down` に切替。
- Find widget を非インタラクティブ領域でドラッグ移動できるように実装（ボタン/textarea等は除外）。
