# ブロックUI詳細設計書

## 1. ブロックハンドル（block-handle-container）

### 1.1 要件

#### 表示条件
- **全てのブロックタイプ**でハンドルを表示
  - paragraph, heading, listItem, codeBlock, blockquote, horizontalRule, rawBlock
  - tableは専用UIで対応（TableControls）
- **ブロックにマウスホバー時**にハンドルを表示
- ブロックからマウスが離れたら遅延非表示（150ms）

#### ハンドル構成
```
[+] [⋮⋮] ← ブロック左端に表示
 │    │
 │    └─ 6点ドラッグハンドル（ドラッグ or 左クリックでメニュー）
 └─ +ボタン（クリックでblock-type-menu表示）
```

#### 動作
- 6点ハンドルをドラッグ → ブロック移動
- 6点ハンドルを左クリック → コンテキストメニュー（削除、コピー）
- +ボタンをクリック → block-type-menuを表示

### 1.2 実装ファイル
`packages/webview/src/editor/blockHandlesExtension.ts`

---

## 2. テーブルUI（table-controls）

### 2.1 +ボタン（実装済み）

#### 要件
- テーブルの**右端**に列追加ボタン（固定位置）
- テーブルの**下端**に行追加ボタン（固定位置）
- クリックで最終行/列に追加

#### 実装ファイル
`packages/webview/src/editor/tableControlsExtension.ts`

### 2.2 行/列ハンドル（未実装）

#### 要件
- 各行の左側に行ハンドル（6点ドット）
- 各列の上側に列ハンドル
- ハンドルをドラッグして行/列を入れ替え
- ハンドルをクリックして行/列を選択

#### 実装方針
1. BlockHandlesと同様の固定位置UI方式を採用
2. テーブルホバー時に行/列ハンドルを表示
3. CellSelectionと連動して選択状態を管理

---

## 3. block-type-menu（ブロック挿入メニュー）

### 3.1 トリガー
- **+ボタンクリック**: 現在ブロックの下に新ブロック挿入
- **`/`入力**: 現在ブロックを変換

### 3.2 入力検出（キーボードショートカットではない）

```
/         → メニュー表示（テキストとして入力される）
/hea      → "heading"でフィルタ（入力文字で絞り込み）
スペース   → メニュー閉じる
Backspace → フィルタ文字削除、/削除でメニュー閉じる
```

### 3.3 メニュー内操作

| 操作 | キー | 動作 |
|------|------|------|
| 上に移動 | `↑` | 前の項目にフォーカス |
| 下に移動 | `↓` | 次の項目にフォーカス |
| 選択確定 | `Enter` | 選択してブロック挿入/変換 |
| キャンセル | `Escape` | メニューを閉じる |

---

## 4. キーボード操作仕様

### 4.1 VSCode統合方針

**原則**: キーボードショートカットはVSCodeの`contributes.keybindings`で登録し、ユーザーがカスタマイズ可能にする。

#### 実装パターン
```
1. package.json で keybindings 登録
2. extension.ts で commands 登録
3. コマンドハンドラーから webview に postMessage
4. webview で Tiptap コマンド実行
```

#### when句によるスコープ制御
```json
{
  "key": "cmd+b",
  "command": "inlineMark.toggleBold",
  "when": "activeCustomEditorId == 'inlineMark.editor'"
}
```

#### カスタムコンテキストキー
```typescript
// ポップアップ表示状態を管理
vscode.commands.executeCommand('setContext', 'inlineMark.popupVisible', true);
```

### 4.2 テキストフォーマット（VSCodeキーバインド）

| 操作 | Mac | Windows | コマンドID |
|------|-----|---------|-----------|
| 太字 | `Cmd+B` | `Ctrl+B` | `inlineMark.toggleBold` |
| 斜体 | `Cmd+I` | `Ctrl+I` | `inlineMark.toggleItalic` |
| コード | `Cmd+E` | `Ctrl+E` | `inlineMark.toggleCode` |
| リンク | `Cmd+K` | `Ctrl+K` | `inlineMark.insertLink` |

### 4.3 テーブル操作（VSCodeキーバインド）

| 操作 | Mac | Windows | コマンドID | when句 |
|------|-----|---------|-----------|--------|
| 右セルへ | `Tab` | `Tab` | `inlineMark.table.nextCell` | `inlineMark.inTable` |
| 左セルへ | `Shift+Tab` | `Shift+Tab` | `inlineMark.table.prevCell` | `inlineMark.inTable` |

### 4.4 メニューナビゲーション（VSCodeキーバインド）

| 操作 | キー | コマンドID | when句 |
|------|------|-----------|--------|
| 上に移動 | `↑` | `inlineMark.menu.prev` | `inlineMark.menuVisible` |
| 下に移動 | `↓` | `inlineMark.menu.next` | `inlineMark.menuVisible` |
| 選択確定 | `Enter` | `inlineMark.menu.select` | `inlineMark.menuVisible` |
| キャンセル | `Escape` | `inlineMark.menu.cancel` | `inlineMark.menuVisible` |

### 4.5 入力検出（Tiptap内部処理）

以下はキーボードショートカットではなく、入力されたテキストの判定で処理する：

#### スラッシュコマンド
- `/`入力 → block-type-menu表示
- 続く文字 → フィルタリング
- スペース → メニュー閉じる

#### Markdown自動変換（行頭入力）
| 入力パターン | 変換結果 |
|-------------|----------|
| `# ` + Space | 見出し1 |
| `## ` + Space | 見出し2 |
| `### ` + Space | 見出し3 |
| `- ` or `* ` + Space | 箇条書き |
| `1. ` + Space | 番号付きリスト |
| `> ` + Space | 引用 |
| ``` ` ` ` ``` + Enter | コードブロック |

---

## 5. block-label（ブロックラベル）

### 5.1 用途
- RAWブロック: 「RAW」+ infoボタン
- コードブロック: 言語名（例: "javascript"）
- ファイル添付: ファイル名

### 5.2 位置
- ブロック左上に固定
- 本文と重ならないようpadding-top確保

### 5.3 RAWブロック特有
- infoボタン（丸いiマーク）を表示
- ホバーで「Markdownとして解析できなかった部分です」と説明

---

## 6. 実装優先度

### Phase 1（高）
- [x] テーブル+ボタン
- [x] スラッシュコマンド基本動作
- [x] block-label（RAWブロック）
- [x] ドラッグ問題修正（lastValidBlockInfoフォールバック）
- [x] VSCodeキーバインド統合（全フォーマット、見出し、リスト、undo/redo）

### Phase 2（中）
- [ ] テーブル行/列ハンドル（Notion風）
- [ ] メニューキーボードナビゲーション（↑↓, Enter, Escape）
- [ ] コンテキストキー管理（inlineMark.menuVisible等）

### Phase 3（低）
- [ ] 行/列ドラッグ入れ替え
- [ ] 見出しジャンプ
