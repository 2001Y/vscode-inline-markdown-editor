# UI: テーブルUI/ブロックハンドル/タブバーアイコン 調査・相談メモ (2026-01-10)

## 目的
- テーブルUIの+を右/下のみ・全幅/全高・枠線のみへ変更
- 「テキストエディタで開き直す」アイコンがタブ右端に常時表示されない問題の方針整理
- ブロックハンドル（リスト以外で無効化）について、Tiptapでのスマートでシンプルな実装選択肢を調査

## 現状 (コード)
- テーブルUI: `packages/webview/src/editor/tableControlsExtension.ts`
  - `updateButtonPositions` で行/列追加ボタンの配置を決定
  - これまでは行: 上/下、列: 左/右に出し分けていた（hover位置でbefore/after）
- ブロックハンドル: `packages/webview/src/editor/blockHandlesExtension.ts`
  - `findBlockFromDOM` → `view.posAtDOM` → `NodeSelection` + `dropPoint` でドラッグ移動
  - `HANDLE_BLOCK_TYPES`: paragraph/heading/listItem/codeBlock/blockquote/horizontalRule/rawBlock/htmlBlock
  - 問題: リスト以外のブロックでハンドル操作が効かない
- Reopen with Text Editor: `packages/extension/package.json`
  - `contributes.menus.editor/title` に配置
  - `when`: `activeCustomEditorId == 'inlineMark.editor' || activeWebviewPanelId == 'inlineMark.editor'`
  - `group`: `navigation@0`
  - `command` に `icon: $(split-horizontal)`
  - 現象: タブ右端に常時表示されず、"..."(More Actions) 内でのみ見える

## o3相談結果（要約）
### [1] タブバー右端アイコンの常時表示
- **結論**: editor/title の “primary group” は表示数に上限があり、超過分は `...` にオーバーフローする仕様。
  - 拡張側から常時表示を強制する手段はない。
- **実務的対応**
  - `editor/title` の `group: navigation@0` / `when: activeCustomEditorId == <viewType>` は正しい。これ以上は保証不可。
  - 代替導線として `editor/title/context` と `commandPalette` にも出す。
  - ユーザーがツールバーをカスタマイズしている可能性があるため、`Reset Menu` の案内も検討。

### [2] ブロックハンドル実装の選択肢
- **推奨A (最短・公式寄り)**: `@tiptap/extension-drag-handle` + `Dropcursor` の採用。
  - `DragHandle.configure({ render, onNodeChange, computePositionConfig })` でUI/位置/対象制御。
  - ドラッグ移動の主処理は公式拡張に委譲でき、保守コストが低い。
- **選択肢B**: NodeView + handleDOMEvents で NodeSelection して DnD は ProseMirror に委譲。
  - 依存は増えないが NodeView の保守が必要。
- **選択肢C**: Decoration.widget で左ガターにハンドルを出す。
  - NodeView を増やさず実装可能だが、座標計算と再描画の負担が増える。

## 次の検討事項
- DragHandle 拡張が利用可能か（ライセンス/依存/ビルド）を確定させる
- カスタム実装を続けるなら、リスト以外で無効化される原因のログ強化
- “常時表示できない仕様” を前提に、UI導線を複線化（context menu / command palette / keybinding）
