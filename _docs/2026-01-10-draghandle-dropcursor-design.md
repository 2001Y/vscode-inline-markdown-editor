# DragHandle + Dropcursor 詳細設計（Tiptap v3 / vanilla）(2026-01-10)

## 目的
- ブロックハンドルの DnD を **Tiptap公式 DragHandle** に委譲できる部分は委譲し、独自D&Dロジックを最小化する。
- ドロップ位置の可視化は **Dropcursor** で統一する。
- テーブルは別UI（TableControls）を継続し、DragHandle の対象から除外。

## 前提
- フレームワークなし（vanilla）。
- 現行 `blockHandlesExtension.ts` は DnD と UI を兼務。
- スラッシュコマンド（block-type-menu）は継続必須。

## 方針（最小・公式寄り）
1) DragHandle: ハンドル表示とドラッグ開始を公式拡張に委譲
2) Dropcursor: 位置インジケータは公式拡張（CSSのみ調整）
3) 既存の独自 dragstart/drop/posAtDOM などの実装は削除
4) 失敗時はフォールバックせず、**ログで明示**（DEBUG/ERROR）

## 構成案
### A. BlockHandles を分割する（推奨）
- `dragHandleExtension.ts`
  - DragHandle.configure をここで実装
  - `render` で 6点グリップ + “+” を生成
  - `onNodeChange` で現在ノードを更新、対象タイプ外なら非表示
- `blockTypeMenuExtension.ts`
  - スラッシュコマンド検出・メニュー表示
  - “+” ボタンはこの拡張の API を呼び出してメニューを出す
    - API 契約（例）:
      - blockTypeMenuExtension 側: `addStorage()` で `{ openMenu(pos, node), closeMenu(), isOpen() }` を公開
      - dragHandleExtension 側: `editor.extensionManager.get('blockTypeMenu').storage.openMenu(pos, node)` を呼ぶ

### B. DragHandle の render に UI ロジックを寄せる（最小ファイル数）
- DragHandle の `render` 内で “+” ボタンとメニュー呼び出しまで含める
- ただし slash command は別拡張（現行 blockHandles の一部）として残す

> 誤抽象を避けるため、DnD とメニューの責務は分離するのが望ましい。

## 実装ステップ（詳細）
### 1) 依存追加（公式 DragHandle を採用する場合のみ）
- `packages/webview/package.json` に `@tiptap/extension-drag-handle: "^3.15.3"` を追加
  - 既存の @tiptap 系と **同一バージョンで揃える**（混在は避ける）

### 2) Dropcursor の構成
- StarterKit 既存の Dropcursor を **configure** するか、StarterKit で無効化して単体追加
  - 例: `Dropcursor.configure({ color, width, class })`
- CSS で `.ProseMirror-dropcursor` または class を調整

### 3) DragHandle の構成
- `DragHandle.configure({ render, onNodeChange, computePositionConfig, locked })`
- `computePositionConfig` は floating-ui の設定（例: `{ placement, strategy, middleware }`）で位置計算を上書きするためのオプション
  - **注**: 公式 DragHandle の API 名はバージョン差異があり得るため、`computePositionConfig` / `floatingOptions` など実名は一次情報で確認する

### 3.5) DragHandle API 確認スパイク（事前必須）
- @tiptap/extension-drag-handle の **実 API** を確認し、暫定名称を確定名称へ置換する。
- 確認項目:
  - `DragHandle.configure` で受け取れる **オプション名**（`computePositionConfig` / `floatingOptions` など）
  - storage で参照できる状態（`activePos` などの有無）
  - lock/unlock コマンドの有無（UI 固定に使えるか）
  - onNodeChange / onDragStart / onDrop 等の **イベント有無と署名**
- 結果をこの設計書に追記し、曖昧記述を削除してから実装に進む。
- `render` で作るDOM
  - コンテナ（class: `block-handle-container`）
  - 6点グリップ（class: `block-handle`）
  - “+” ボタン（class: `block-add-btn`）
- `onNodeChange` の責務
  - `node` が `null` の場合は UI を非表示
  - `node.type.name` が table / tableRole の場合は UI を非表示
  - 対象ノードの場合は **pos と node を保持**
    - 推奨: extension storage に `{ activeNode, activePos }` を保存
    - 参照例: `editor.extensionManager.get('dragHandle').storage.activePos`
  - draggable 判定は **allowlist** で明示（例: `const draggableTypes = ['paragraph','heading','listItem','codeBlock','blockquote']`）
    - `isValidNode = (node) => draggableTypes.includes(node.type.name)` を onNodeChange 内で利用
  - **エラー時は状態をリセット**（pos/nodeクリア、menu閉じ、lock解除）

### 4) “+” ボタンの挙動
- クリック時に **block-type-menu を開く**
- 挿入を行う場合は以下の順で安全に操作
  1) `editor.commands.setTextSelection(pos)` でキャレット位置へ戻す
  2) `insertContent` / `toggle*` などのコマンド実行
- メニューを開いている間は DragHandle の lock を使い UI を固定
  - **注**: 公式 DragHandle に lock/unlock コマンドが無い場合は、拡張 storage に `locked` フラグを持たせて制御する
  - lock の効果: ドラッグハンドルの再描画/移動を止め、pointer events を無効化
  - メニュー終了時は unlock で解除
- メニュー確定後は **明示的に closeMenu を呼び出す**
  - 例: `blockTypeMenuExtension.storage.closeMenu()` を実行してから unlock
- **pos が無効 or node が null の場合は ERROR ログを出して中止**（lock解除/メニュー閉じ）

### 5) 既存D&Dロジックの削除
- `blockHandlesExtension.ts` の
  - `dragstart/dragover/drop` ハンドラ
  - `dropPoint` / `NodeSelection` を用いた独自移動
  - `posAtDOM` などの位置推定系
  を撤去

### 6) ログ（必須）
- INFO
  - DragHandle 初期化 / Dropcursor 初期化
- DEBUG
  - onNodeChange の node/type/pos
  - “+” ボタンクリック時の target node
- ERROR
  - node が null で操作が走った場合
  - insertContent が失敗した場合

## CSS 指針
- DragHandle の位置は floating-ui が計算するため、**固定配置のCSSは不要**
- `block-handle-container` の見た目調整のみ
- `.ProseMirror-dropcursor` の色・高さ・z-index を明示

## 受け入れ条件
- paragraph/heading/listItem/codeBlock/blockquote 等でドラッグ可能
- table は DragHandle による操作対象外
- Dropcursor が常に視認可能
- エラー時はログが残り、フォールバックしない


## Optional: listItem 対応（InlineDragHandle）
- 公式 DragHandle は **top-level DOM に固定**されるため、listItem を直接ターゲットにできない。
- listItem 単位のハンドルが必須な場合のみ、**公式ロジックを最小限ベースにした InlineDragHandle を追加**する。
  - 近傍DOMから **listItem を優先探索**
  - onNodeChange で active node / pos を更新
  - DnD は ProseMirror の既定ドロップに委譲（NodeSelection + view.dragging）
  - Dropcursor は **公式拡張を継続使用**
- これは **公式 DragHandle の全面代替ではなく、listItem 専用の補助**として位置付ける。
