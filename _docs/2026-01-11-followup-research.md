# 2026-01-11 フォローアップ調査・選択肢まとめ

## 対象
- リスト/ブロックのインデント制御
- DragHandle の nested list / scroll 後の検出
- Drag/Drop 補助線の表示条件
- コードブロックのハイライト/ラベル
- RAW 編集不能の原因切り分け
- Notion 風ネストページ（md ネスト）

---

## 1. Tiptap 複数ブロック選択（公式/標準）

### 結論
- 公式拡張: **@tiptap/extension-node-range** が NodeRangeSelection（複数ノード範囲選択）を提供。
- DragHandle は NodeRangeSelection を利用して複数ブロックをドラッグする構成。

### 根拠
- DragHandle React 公式 doc が @tiptap/extension-node-range の導入を明記。
- extension-node-range のソースに NodeRangeSelection と Shift+矢印・Mod+A の挙動が実装。
- DragHandle のソースが NodeRangeSelection と getSelectionRanges を使用。

### 反映方針（最小）
- NodeRangeSelection を選択状態の唯一表現として扱う。
- Block/Handle UI の「複数ブロック選択」操作は NodeRangeSelection 生成で統一。

---

## 2. コードブロックのハイライト（VS Code 本体のハイライト流用可否）

### 結論（一次情報）
- Webview で公式に使えるのは **テーマ色 CSS 変数**と **vscode-light/dark/high-contrast クラス**。トークン色ルールや TextMate トークナイザそのものは Webview へ公開されていない。

### 公式準拠の選択肢（シンプル順）
1) **CodeBlockLowlight + lowlight（Tiptap公式）**
   - Tiptap 公式拡張で fenced code を lowlight によってハイライト。
   - Webview のテーマ色（--vscode-*）と light/dark クラスで CSS を切替。

2) **highlight.js 直利用（Webview 内）**
   - 最小構成（CSS + highlightElement/highlightAll）で適用。
   - 言語は fence の明示指定のみ。未知言語はエラー表示/ログ。

3) **Shiki（TextMate + VS Code theme 系）**
   - TextMate ベースのトークナイズで VS Code の色に近づける。
   - Webview 内 or extension 側で HTML 生成し、Webview は表示のみ。

4) **vscode-textmate + vscode-oniguruma（低レベル）**
   - VS Code が内部で使う TextMate トークナイザを自前で回す。
   - テーマ解決/HTML 生成/キャッシュを全部自前で持つ必要がある。

---

## 3. コードブロックに「言語名 + filename」ラベルを表示

### 結論
- 公式で「filename」を解釈する標準は見当たらない。
- 既存 CodeBlock 拡張に **属性追加 + NodeView** を追加するのが最小。

### 最小設計（推奨）
- 属性: `language` / `filename` を CodeBlock に追加。
- Markdown parse: fence info string を `language` と `filename="..."` から抽出（不明は空）。
- NodeView: 既存 RAW の .block-label を再利用し、`LANG` + `filename` を表示。

---

## 4. Notion 風ネストページ（md ネスト）

### 調査結果
- Tiptap 公式拡張に「ネストページ」/「サブドキュメント」相当は無い。
- 実装は VS Code 拡張（ファイル操作）+ Tiptap（ノード/UI）側で作る必要がある。

### 想定アーキテクチャ（案）
1. ノード: `nestedPage`（title, filePath, fileId など）
2. UI: ブロック内に「ページ名 + 参照パス」を表示（クリックで open）
3. ファイル生成: 新規ネスト作成時に
   - 現在の md の **親フォルダ**に「新規フォルダ（現ファイル名）」を作成
   - その中に新しい md を作成
4. 参照: `nestedPage` は md パスを保持し、拡張側で open/rename を管理
5. ログ: 作成/移動/削除/rename を必ず記録

---

## 5. DragHandle の nested list / scroll 後の検出

### 既存実装の要点
- elementsFromPoint + posAtDOM でリスト項目を解決
- listItem は深い階層を優先するロジックあり
- onMouseMove は editor-container に bind

### 課題仮説
- scroll 後に mousemove が発火しない / 直前座標が更新されない
- listItem DOM の検出が「親 li」で止まるケースがある

### 選択肢（シンプル順）
A) scroll イベントで「最後の mouse 座標」を再解決して handle 再表示
B) drag handle 判定を `li[data-node-pos]` のような確実な DOM マーカーに寄せる
C) Tiptap 公式 DragHandle + NodeRangeSelection を使い、li をブロックとして扱う

---

## 6. Drag/Drop 補助線（no-op 移動は表示しない）

### 要件
- 移動しても結果が変わらない（同位置 or 前後 1 以内）は補助線を表示しない

### 選択肢
A) **テーブル DnD**: boundary が `fromIndex` または `fromIndex+1` の場合は indicator を隠す
B) **ブロック DnD**: drop pos が「同一ノード内」or「直前/直後で no-op」なら dropcursor を抑制

---

## 7. RAW が編集できない問題

### 疑いポイント
- NodeView の stopEvent/ignoreMutation 未設定で PM が入力を奪う可能性
- handle overlay の pointer-events が上書きしている可能性
- NodeView の textarea focus → selection が editor 側に奪われる可能性

### 最小の切り分けログ
- textarea の focus/keydown/input が発火しているか
- textarea の parent が contentEditable=false になっていないか
- dragHandle overlay の hit test をログ化

### 修正案（候補）
A) NodeView に stopEvent を追加（textarea 内イベントは PM に渡さない）
B) raw-block の dom に `contentEditable="false"` を明示し、textarea を独立編集にする
C) handle overlay を raw-block 上では pointer-events:none に切り替え

---

## 8. 既に反映済みの軽微修正
- block-label-info を icon 化（Tabler info icon）
- Table add button の位置補正 (-2px → -1px)
- has-focus ハイライト削除

---

## 9. 決定事項（2026-01-11）
- コードハイライトは **CodeBlockLowlight + lowlight** を採用（公式拡張で統一）
- 複数ブロック選択は **extension-node-range** を採用
- list/非list とも **1段ずつの階層化 + 最大10** に統一
- DnD 補助線は **no-op 位置では非表示**にする方針
