# inlineMark ファイル内検索（Cmd+F）実装計画

- 作成日: 2026-02-02
- 目的: inlineMark Webview 内で VS Code 標準に近い検索/置換 UX を再現する
- 対象: `packages/webview` / `packages/extension`

---

## 0. 前提（プロジェクト方針の再確認）

- 公式推奨・標準準拠のシンプル実装（余計な抽象を増やさない）
- 誤抽象・暫定フォールバックの延命はしない（必要なら削除して正しく作り直す）
- 失敗は隠さずエラーを即時に可視化
- 完全ログ主義（入力/処理/出力、タイムスタンプ、所要時間を必ず残す）

---

## 1. 調査サマリ（一次情報ベース）

### 1.1 VS Code 標準の Find/Replace UX 要素

- 検索は入力と同時に即時反映（設定で無効化可能）
- Enter = 次へ / Shift+Enter = 前へ
- Find in Selection の切替
- Match Case / Whole Word / Regex / Preserve Case
- マルチライン検索（Ctrl+Enter で改行入力）
- 右上の Find widget は横幅リサイズ可能（左端ドラッグ / ダブルクリック）
- 検索結果はエディタ内ハイライト＋overview ruler/minimap に反映

### 1.2 VS Code デフォルト・キーバインド（カスタムエディタ用に再現）

- Cmd+F: Find
- Cmd+Option+F: Replace
- Cmd+G / F3: 次の一致
- Shift+Cmd+G / Shift+F3: 前の一致
- Option+Cmd+C: Match Case トグル
- Option+Cmd+W: Whole Word トグル
- Option+Cmd+R: Regex トグル
- Alt+Enter: すべて選択
- Alt+L: Find in Selection トグル

### 1.3 Tiptap 公式の推奨実装ルート（検索そのものは未提供）

- Tiptap は拡張機構が基本であり、ProseMirror プラグインは `addProseMirrorPlugins` で統合するのが公式ルート
- 公式ドキュメント上、検索/置換の専用拡張の明示的な推奨は見当たらず
  - そのため「公式推奨＝拡張で PM プラグイン統合」というルートが最も妥当

### 1.4 ProseMirror Search プラグイン（候補）

- `prosemirror-search` は `search()` プラグインで検索状態（query/range/decorations）を保持
- `SearchQuery` で case/regex/wholeWord/replace を制御できる
- `setSearchState` で query/range を更新し、`getMatchHighlights` でマッチ装飾を取得
- `findNext / findPrev / replaceNext / replaceAll` などのコマンドがある
- 既定の CSS クラス: `ProseMirror-search-match` / `ProseMirror-active-search-match`

### 1.5 DeepWiki / Context7 / o3MCP の調査結果

- DeepWiki: tiptap-docs に検索/置換の公式推奨は見当たらず
- DeepWiki: ProseMirror/prosemirror-search は未インデックス
- Context7: 利用不可（環境に未導入）
- o3MCP: 2回タイムアウト → 短い相談で回答取得

---

## 2. 実装方式の選択肢（検討の余地は全て列挙）

### 2.1 検索ロジック

**Option A: `prosemirror-search` を採用（推奨）**
- 長所: 公式 PM プラグイン、検索/置換コマンドとハイライトがまとまっている
- 短所: VS Code 特有の UI/UX（Find in Selection / マルチライン / 結果カウント）を拡張実装する必要あり

**Option B: 自前 PM プラグイン + DecorationSet**
- 長所: VS Code 仕様に合わせた柔軟設計（Find in Selection / 改行跨ぎ / カウント制御）
- 短所: 実装量が大きい、性能調整の責務が増える

**Option C: Mark を埋め込んでハイライト（非推奨）**
- 長所: 実装が簡単
- 短所: ドキュメント変更が発生し Undo/Sync/差分が壊れやすい（方針違反）

### 2.2 検索対象のスコープ

**Option A: TextNode 単位（跨ぎなし）**
- 長所: 実装が単純、パフォーマンス安定
- 短所: 改行/ブロックを跨ぐ一致が拾えない

**Option B: 全文線形化（改行跨ぎ対応）**
- 長所: VS Code に近い挙動
- 短所: offset→doc position の復元が必要、実装複雑

### 2.3 検索 UI の表現

**Option A: VS Code 風 widget を Webview DOM で再現（推奨）**
- 長所: UX を完全に再現できる
- 短所: CSS/フォーカス/キーバインドの作り込みが必要

**Option B: 既存の BlockHandles/BubbleMenu を流用して検索 UI を出す**
- 長所: 実装量が減る
- 短所: VS Code UI と乖離、要件未達

### 2.4 状態管理

**Option A: Webview 内で完結（推奨）**
- 検索状態は Webview のみに保持し TextDocument を汚さない
- VS Code の Editor 状態は `vscode.setState` で復元可能

**Option B: Extension 側に保持**
- マルチ Webview 同期は容易
- ただし search 状態を sync するためのプロトコル増設が必要

### 2.5 キーバインド統合

**Option A: VS Code keybindings → extension command → webview command（推奨）**
- VS Code と同じキーバインド設定/上書きを尊重
- 既存のコマンド送信モデルと一致

**Option B: Webview で keydown を直接ハンドリング**
- 実装は簡単
- ただし VS Code の再バインド設定が効かない

### 2.6 アイコン表現

**Option A: Codicon フォントを Webview に導入（採用）**
- VS Code の製品アイコンと同一名を使用できる
- 全アイコンを Codicon に統一（Tabler SVG は削除）
  - 例外: Codicon に相当アイコンがないもの（H1/H2/H3 等）は文字ラベルで代替（要検討）

**Option B: SVG アイコンを自前同梱（不採用）**
- CSP/フォントを気にせず動作
- ただし運用負担が増えるため今回不採用

### 2.7 検索結果の視覚化

**Option A: 本文ハイライトのみ（MVP 推奨）**

**Option B: overview ruler / minimap 相当の縦バー表示（検討）**
- エディタスクロールバー上にマークを出すカスタム実装
- 負荷/実装コストが高い

---

## 3. 推奨アーキテクチャ（現状との整合重視）

- **検索ロジックは非破壊（DecorationSet）**
- **UI は Webview DOM で VS Code 風 widget を再現**
- **コマンド経路は VS Code keybindings → extension → webview**
- **検索状態は Webview 内で保持（document を汚さない）**

プロセスは以下：
1. Cmd+F → `inlineMark.find` コマンド → Webview へ `editorCommand` 送信
2. Webview が Find widget を表示し入力へフォーカス
3. 入力変更 → SearchQuery 更新（DecorationSet を再生成）
4. Enter/Shift+Enter で next/prev を選択し selection を移動
5. replace/replaceAll のみ doc change を発生させ、SyncClient が通常通り diff を送信
6. Find widget の開閉を `findWidgetStateChange` で通知し、VS Code の `inlineMark.findWidgetVisible` を更新

---

## 4. 実装詳細計画

### 4.1 Extension 側（`packages/extension`）

1) `package.json` にコマンド追加
- `inlineMark.find`
- `inlineMark.replace`
- `inlineMark.findNext`
- `inlineMark.findPrevious`
- `inlineMark.toggleFindInSelection`
- `inlineMark.toggleMatchCase`
- `inlineMark.toggleWholeWord`
- `inlineMark.toggleRegex`
- `inlineMark.togglePreserveCase`
- `inlineMark.closeFind`

2) `package.json` に keybindings 追加
- VS Code デフォルトに合わせる（Cmd+F / Cmd+Option+F / Cmd+G / Shift+Cmd+G など）
- `when`: `activeCustomEditorId == 'inlineMark.editor' && !inlineMark.menuVisible`
- 追加で `inlineMark.findWidgetVisible` を setContext し、入力中の競合回避に使う

3) `extension.ts` にコマンド登録
- 既存の editorCommand 送信の仕組みに統合

### 4.2 Webview 側 UI（新規 `findWidget.ts` など）

1) DOM 構造
- `.find-widget` コンテナ
- `.find-input`（検索語）
- `.find-toggles`（Match Case / Whole Word / Regex / Find in Selection / Preserve Case）
- `.find-count`（例: `1 / 12`）
- `.find-actions`（Prev/Next/Close）
- `.replace-row`（Replace 入力 / Replace / Replace All）
- `.find-close`（Esc/×）
- `.find-status`（警告/エラー表示）

2) UI 状態
- `visible`, `replaceVisible`, `invalidRegex`, `matchCount`, `activeIndex`
- `query`, `replace`, `flags`
- `history`（検索/置換履歴は未実装、必要なら `vscode.setState` で追加）

3) 挙動
- 表示時に `seedSearchStringFromSelection` 相当で初期 query を決定
- `findOnType` なら即時検索
- Enter/Shift+Enter/F3/Shift+F3 で移動
- Alt+L で Find in Selection トグル
- Ctrl+Enter で検索語に改行挿入
- ESC で widget 閉じてエディタにフォーカス復帰

### 4.3 Tiptap/ProseMirror 拡張（`packages/webview/src/editor/searchExtension.ts`）

**基本方針**
- `addProseMirrorPlugins` で検索プラグインを統合
- 検索操作は `docChanged=false` のトランザクションで行い、SyncClient に不要な edit を送らない
  - `setSearchState(tr, query, range).setMeta('addToHistory', false)` を使用

**Option A: prosemirror-search 採用（MVP 推奨）**
- `SearchQuery` を持つ状態管理
- `findNext / findPrev / replaceNext / replaceAll` を利用
- CSS で `ProseMirror-search-match` / `ProseMirror-active-search-match` をスタイル

**Option B: 自前プラグイン**
- `PluginState` に `query/flags/matches/activeIndex/decorationSet` を持つ
- `Decoration.inline` で一致箇所を描画
- 需要が出たら「改行跨ぎ検索」「選択範囲検索」を拡張

### 4.4 Webview コマンドハンドリング（`main.ts`）

- `editorCommand` の command 名を追加
- `searchWidget` API を呼び出す
  - `openFind()` / `openReplace()` / `next()` / `prev()` / `replace()` / `replaceAll()` / `close()`
  - `toggleMatchCase()` / `toggleWholeWord()` / `toggleRegex()` / `toggleFindInSelection()` / `togglePreserveCase()`

### 4.5 CSS（`styles.css`）

- `.find-widget` の追加（VS Code の `editorWidget` 系色変数で構成）
- focus, invalidRegex, selected 状態
- `ProseMirror-search-match` / `ProseMirror-active-search-match` の配色

### 4.6 Logging（完全ログ主義）

**必須ログポイント**
- `FindUI open/close`（入力初期値、理由、時刻）
- `Query updated`（文字数、フラグ、所要時間）
- `Search executed`（hit count、duration、regexValid）
- `Navigate next/prev`（index, from/to）
- `Replace/ReplaceAll`（件数、duration）
- `Find in selection` トグル（selection range の有無）

**ログレベル**
- INFO: UI 操作開始/終了
- DEBUG/STATES: query/flags/matches 詳細
- SUCCESS: 置換完了
- WARNING: regex invalid、0 matches
- ERROR: plugin 例外 / internal failure

### 4.7 テスト計画（最低限）

- Cmd+F で widget 表示、Esc で閉じる
- query 入力 → 即時検索、Enter/Shift+Enter で移動
- Match Case / Whole Word / Regex が反映される
- Find in Selection が選択範囲で絞り込まれる
- Replace/Replace All が正しく doc に反映される
- Undo/Redo に影響がない（検索操作では履歴に載らない）
- マルチライン検索が動作する
- 1000+ 行の Markdown で性能が破綻しない

---

## 5. リスク・エッジケース

- 正規表現が不正な場合の UI 表示（赤枠 / エラーメッセージ）
- IME 入力中の query 更新タイミング
- Word boundary が CJK に弱い問題（Whole Word の定義）
- prosemirror-search は textblock 単位の走査のため、ブロック跨ぎ検索は不可
- selection 範囲が doc 変更でずれる場合
- replaceAll の mapping ずれ（後ろから置換 or mapping 使用）
- SyncClient の edit debounce と Replace 処理の競合

---

## 6. 未確定 / 追加検討事項

- 検索対象は TextNode 単位で十分か（改行跨ぎ対応の必要性）
- Find in Selection の仕様（選択範囲が空の時の挙動）
- history の保持範囲（セッションのみ or workspace persist）
- overview ruler/minimap 相当の可視化を実装するか
- VS Code `editor.find.*` 設定の取り込み範囲
- Codicon に相当がないアイコン（H1/H2/H3, outdent 等）を文字表現のまま維持するか

---

## 7. 参考リンク（一次情報）

- VS Code API: WebviewPanelOptions `enableFindWidget`  
  https://code.visualstudio.com/api/references/vscode-api#WebviewPanelOptions
- VS Code When Clause Contexts  
  https://code.visualstudio.com/api/references/when-clause-contexts
- VS Code Product Icons (Codicon)  
  https://code.visualstudio.com/api/references/icons-in-labels
- Codicon リポジトリ  
  https://github.com/microsoft/vscode-codicons
- Tiptap Extension API (`addProseMirrorPlugins`)  
  https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension
- ProseMirror Search Plugin  
  https://github.com/ProseMirror/prosemirror-search
