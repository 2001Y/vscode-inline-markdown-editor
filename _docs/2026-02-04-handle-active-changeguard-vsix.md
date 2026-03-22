# 2026-02-04 VSIX作成 / ハンドル1件表示 / ChangeGuard整理

## VSIX作成結果
- `npm run package` 実行済み。
- 出力: `packages/extension/inlinemark-0.1.1.vsix`

## アクティブ1件のみハンドル表示の実装方針（現状のコード前提）
対象: `packages/webview/src/editor/inlineDragHandleExtension.ts`

現状:
- `createHandleDecorations()` で `doc.descendants` を走査し、
  すべての対象ブロックに `Decoration.node` + `Decoration.widget` を生成。
- 表示は CSS の `:hover` に依存（`.block-handle-host:hover .block-handle-container`）。
- その結果、装飾数・DOM数が O(N) になる。

アクティブ1件化の基本手順:
1. Plugin state に `activeHandle` (pos / nodeType / isVisible) を追加。
2. `pointermove` / `mouseover` でホバー中ブロックを特定し、
   `tr.setMeta(InlineDragHandlePluginKey, { activePos })` で state を更新。
3. `props.decorations` では `activePos` の 1件だけ `Decoration.widget` を作成。
4. `Decoration.node` に依存している `block-handle-host` の padding を
   全ブロックに適用する場合は CSS 側で共通パディングを与える。
   (例: `.inline-markdown-editor-content > * { padding-left: ... }` など)
5. hover 解除時は `activePos = null` に戻す。

備考:
- `posAtCoords` と `resolveListItemPosFromCoords` のどちらを使うかで
  listItem の精度が変わるため、既存の listItem 系ユーティリティの
  再利用が安全。
- 「装飾1件だけ + 余白CSS」パターンは DOM 数を最小化できる。
- 余白を Decoration に依存し続ける場合は、
  `Decoration.node` だけ全ブロック維持 → widget のみ 1件に絞る方式も可能。
  (今回はこちらを先に実装)
- NodeView 側で `block-handle-container` を生成しているブロックは
  引き続きブロックごとにハンドルDOMが残るため、
  “完全に1件化”するには NodeView 側の変更も必要。

関連コード:
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/styles.css`

## ChangeGuard
### 現状
- Webview 側の ChangeGuard はコメントアウト済み。
  - `packages/webview/src/editor/createEditor.ts`
  - `packages/webview/src/main.ts`
- Extension 側は `handleEdit` で ChangeGuard 判定を実行するが、
  しきい値超過時はログ出力のみ（ブロックしない）。
  - `packages/extension/src/editors/inlineMarkProvider.ts`

### 大量貼り付け時の挙動
- 大量ペーストや全文置換では `calculateChangeMetrics` が閾値を超える可能性が高い。
- ただし現状は「警告ログのみ」で編集自体は継続される。

### コメントアウトする場合の修正範囲
- 実際に触る必要があるのは基本的に 1 箇所。
  - `packages/extension/src/editors/inlineMarkProvider.ts` の
    `metrics` 計算 + `isChangeGuardExceeded` 判定部分。
- `packages/extension/src/util/textEdits.ts` の関数定義は残しても問題ない。
  (使わないだけ)
