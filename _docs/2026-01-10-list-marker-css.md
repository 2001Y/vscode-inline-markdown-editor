# List marker CSS自前化 + InlineDragHandle修正 (2026-01-10)

## 目的
- list-style: none + ::before/counter による marker 自前化でハンドルとmarkerの衝突を解消する。
- listItem 直下で TextSelection を作るとエラーになるため、Selection.near/findFrom に切り替える。
- InlineDragHandle の keydown で view 未定義エラーを解消する。

## 一次情報（Context7 / ProseMirror）
- TextSelection の端点は「インラインコンテンツ内」である必要があるため、listItem 先頭位置では失敗する。
  - そのため Selection.findFrom / Selection.near を使って、最寄りの有効なカーソル位置へ移動する実装が妥当。

## 実装方針
- CSS
  - ul/ol は list-style: none + padding-left: 0。
  - li に padding-left: 2em を付け、::before で bullet / counter を描画。
  - ol は counter-reset / counter-increment を使う。
- JS
  - list-style:none の場合は marker offset を追加せず、handle 位置は computePosition の結果を使う。
  - listItem の selection は Selection.findFrom/near で決定する。

## o3 フィードバック要約
- A11y: list 構造は保持されるが ::before の番号は読み上げられない場合がある。必要なら ::marker を優先。
- 多桁番号/折返し: 固定 padding だと崩れやすい。grid 2カラムで marker 列を確保すると安定。
- Selection: findFrom/near は妥当だが listItem 範囲外へ飛ばないガードが必要。空 listItem や IME にも注意。
- ログ: dragstart/drop の座標・深度・steps・selection before/after を残すと診断が容易。

## 変更対象
- packages/webview/src/styles.css
- packages/webview/src/editor/inlineDragHandleExtension.ts
