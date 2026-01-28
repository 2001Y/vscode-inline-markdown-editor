# 2026-01-19 ハンドル表示/ドラッグ不具合の原因整理 + ログ強化

## 対象課題
- 見出しにハンドルが表示されない
- 引用はコードブロック同様にブロック全体をハンドル対象にしたい（li だけが例外）
- 見出しの下線を削除
- 全ブロックのドラッグが動作しない（li も不可、テーブルは別ロジックで動作）

## 想定原因（候補）
### 見出しハンドル非表示
- Heading NodeView が有効化されていない / 競合している
- `shouldRenderBlockHandle()` が false（getPos 失敗 / pos 不正 / resolve 失敗 / listItem 内 / table 内）
- DOM 上で `.block-handle-host` が付与されず CSS で非表示扱い
- `.is-handle-locked` / `.is-handle-disabled` による無効化

### 引用ブロックのハンドル範囲
- Blockquote NodeView が無効 → InlineDragHandle が子段落にハンドルを付与
- `HANDLE_NODEVIEW_EXCLUSIONS` に blockquote が含まれていない / allowedNodeTypes 側の差異
- blockquote 内部のブロック構造が想定と違い、デコレーション側の判定がズレる

### ドラッグ不可
- dragstart は発火するが dataTransfer への setData 失敗
- `view.dragging` が上書き/破棄され drop 側で扱えない
- `resolveDropTargetPos()` が null になり drop が適用されない
- `dragSelectionRange` が未設定 / 0 サイズになっている
- メニュー表示などによるハンドルロックで drag を抑止

## 追加ログ（主な観測ポイント）
- `inlineDragHandleExtension.ts`
  - ハンドル装飾の内訳（handleTypes / excludedTypes / skippedReasons）
  - dragstart の詳細（selection / dataTransfer / move / range）
  - dragover の周期ログ（ターゲット pos / drag 状態）
  - drop の適用結果と dragSelectionRange の有無
  - drop target resolve 失敗の WARNING
  - DOM ハンドル数とロック/無効化状態
- `disableKeyboardShortcuts.ts`
  - Heading / Blockquote / ListItem の handle eligibility 判定ログ
  - handle の生成/削除ログ、handle 位置同期ログ
- `blockHandlesExtension.ts`
  - ハンドルの lock/unlock ログ
  - ハンドル posAtDOM / pos missing / node missing の WARNING

## UI 調整
- 見出し h1/h2 の下線を削除（CSS の border-bottom / padding-bottom を解除）

## o3MCP 相談要約
### 追加の原因候補
- heading が条件外（node.type/spec 判定や除外リスト）
- DOM→pos 解決で heading/blockquote が拾えていない（CSS/position ずれ、親探索不足）
- NodeView/Decoration のアンカー位置が子要素に刺さっている
- stopEvent / handleDOMEvents が dragstart を潰している
- dataTransfer が空でブラウザ側 DnD が成立しない
- dropPoint が常に null（schema or pos 解決ミス）

### 追加で有効とされた観測点
- posAtCoords / domAtPos の結果と親チェーン
- node.type/isBlock/isTextblock/spec.selectable/spec.draggable
- NodeView getPos の戻り値と nodeAt(getPos)
- dragstart 前後の view.dragging / selection 種別
- dropPoint の結果と tr.steps 数
