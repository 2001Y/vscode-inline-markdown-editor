# ブロックUI詳細設計書

## 1. ブロックハンドル（ドラッグ + メニュー）

### 1.1 要件

#### 表示条件
- **全てのブロックタイプ**でハンドルを表示する
  - paragraph, heading, listItem, codeBlock, blockquote, horizontalRule, rawBlock
  - tableは専用UIで対応（TableControls）
- **ブロックにマウスホバー時**にハンドルを表示（ハンドル位置へのホバーを待たない）
- ブロックからマウスが離れたら遅延非表示（150ms）

#### ハンドル構成
```
[+] [⋮⋮] ← ブロック左端に表示
 │    │
 │    └─ 6点ドラッグハンドル（ドラッグ or 左クリックでメニュー）
 └─ +ボタン（クリックでblock-type-menu表示）
```

#### ドラッグ動作
- 6点ハンドルをドラッグ開始点とする
- ドラッグ中はドロップインジケーター（青い横線）を表示
- ドロップ時にブロックを移動

#### メニュー動作
- 6点ハンドルを左クリック → コンテキストメニュー（削除、コピー）
- +ボタンをクリック → block-type-menuを表示

### 1.2 実装方針

**Tiptap公式推奨**: `@tiptap/extension-drag-handle` が理想（ただし Pro 有料）

> 本プロジェクトでは Pro 依存を避けるため **採用しない**。
> 現行実装は独自ハンドルで要件を満たす（4.1 参照）。

```typescript
import DragHandle from '@tiptap/extension-drag-handle';

DragHandle.configure({
  render: () => {
    // カスタムハンドルUIを返す
    const container = document.createElement('div');
    container.className = 'block-handle-container';
    // +ボタンと6点ハンドルを追加
    return container;
  },
  onNodeChange: ({ node, editor }) => {
    // ノード変更時の処理
  },
});
```

**利点**:
- 公式サポート・テスト済み
- floating-ui による正確な位置計算
- ドラッグ&ドロップが自動で動作
- Dropcursor/Gapcursor と統合済み

---

## 2. テーブルUI

### 2.1 要件

#### 表示条件
- テーブルにマウスホバー時にコントロールを表示
- テーブルからマウスが離れたら遅延非表示（150ms）

#### UI構成
```
         [+] ← 列追加ボタン（テーブル右端）
┌────────────┐
│  table     │
└────────────┘
     [+] ← 行追加ボタン（テーブル下端）
```

#### 動作
- +ボタン（行）クリック → 最終行の後に行追加
- +ボタン（列）クリック → 最終列の後に列追加
- セル右クリック → コンテキストメニュー（行/列の追加・削除）

### 2.2 現状の問題点

1. **イベント検出**: `view.dom.addEventListener('mouseover', ...)` がテーブルホバーを正しく検出していない可能性
2. **CSS表示**: ボタンが`opacity: 0`のまま変化しない
3. **ラッパー構造**: `table.parentElement`が期待と異なる可能性

### 2.3 デバッグ手順

コンソールで以下を確認：
```
[TableControls] Plugin initialized
[TableControls] MouseOver on table
[TableControls] addControlsToTable called
[TableControls] Controls added successfully
```

---

## 3. スラッシュコマンド

### 3.1 要件

#### 基本動作
1. ユーザーが`/`を入力
2. `/`はテキストとして**そのまま表示**される
3. `block-type-menu`がカーソル位置に表示される
4. `/`の後に続く文字でメニュー項目をフィルタ
   - 検索対象：次のスペースまたは文末まで
   - 例：`/hea` → "Heading 1", "Heading 2", "Heading 3" のみ表示

#### フィルタ動作
```
ユーザー入力: /heading
↓
メニュー表示: [H1 見出し1] [H2 見出し2] [H3 見出し3]
（他の項目は非表示）
```

#### 選択確定時
1. メニューから項目を選択（クリック or Enter）
2. `/`から次のスペースまたは文末までを**削除**
3. 選択したブロックタイプに変換または挿入

#### キャンセル時
- Escapeキー → メニューを閉じる（テキストはそのまま）
- メニュー外クリック → メニューを閉じる（テキストはそのまま）
- スペース入力 → メニューを閉じる（テキストはそのまま）

### 3.2 実装方針

**Tiptap推奨**: `@tiptap/suggestion` を使った実装が可能

> ただし「`/` をテキストとして残す」「独自フィルタ/選択制御」要件のため、
> 本プロジェクトでは **独自実装** を採用（4.3 参照）。

```typescript
import Suggestion from '@tiptap/suggestion';

const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          // range: /から検索文字までの範囲
          // props: 選択されたアイテム
          editor.chain()
            .deleteRange(range)  // /と検索文字を削除
            .setNode(props.type) // ブロックタイプ変更
            .run();
        },
        items: ({ query }) => {
          // queryで項目をフィルタ
          return BLOCK_TYPES.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase())
          );
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
```

### 3.3 メニュー項目定義

```typescript
const BLOCK_TYPES = [
  { title: '見出し1', type: 'heading', attrs: { level: 1 }, keywords: ['heading', 'h1', '見出し'] },
  { title: '見出し2', type: 'heading', attrs: { level: 2 }, keywords: ['heading', 'h2', '見出し'] },
  { title: '見出し3', type: 'heading', attrs: { level: 3 }, keywords: ['heading', 'h3', '見出し'] },
  { title: '箇条書き', type: 'bulletList', keywords: ['bullet', 'list', 'リスト'] },
  { title: '番号付きリスト', type: 'orderedList', keywords: ['ordered', 'number', '番号'] },
  { title: 'コードブロック', type: 'codeBlock', keywords: ['code', 'コード'] },
  { title: '引用', type: 'blockquote', keywords: ['quote', '引用'] },
  { title: 'テーブル', type: 'table', keywords: ['table', 'テーブル', '表'] },
  { title: '水平線', type: 'horizontalRule', keywords: ['hr', 'divider', '区切り'] },
];
```

---

## 4. 実装状況

### 4.1 ブロックハンドル（実装完了）

**実装方式**: 独自実装（`@tiptap/extension-drag-handle`はTiptap Pro有料）

**修正内容**:
- `findBlockFromDOM()`: DOM要素から直接ブロックを検出（`posAtCoords`の代わりに`posAtDOM`を使用）
- `findBlockAtCoords()`: 座標ベースの検出（フォールバック用）
- ブロックコンテンツにホバーした時点でハンドルを表示

**ファイル**: `packages/webview/src/editor/blockHandlesExtension.ts`

### 4.2 テーブルUI（実装完了）

**修正内容**:
- 相対位置（wrapper方式）から固定位置（BlockHandles方式）に変更
- `table.parentElement`への依存を排除
- CSS変数（`--btn-x`, `--btn-y`）で位置指定（CSP対応）

**ファイル**:
- `packages/webview/src/editor/tableControlsExtension.ts`
- `packages/webview/src/styles.css`

### 4.3 スラッシュコマンド（実装完了）

**実装方式**: 独自実装（`@tiptap/suggestion`を使わずプラグインのupdateハンドラーで検出）

**修正内容**:
- `/`はテキストとして表示（キーボードショートカットで防止しない）
- `update()`でテキスト監視し、`/`の検出・フィルタ処理
- `storage.slashCommandRange`で削除範囲を保持
- キーワードフィルタリング対応（日本語/英語）
- 選択時に`/`と検索文字を削除してからブロック変換

**ファイル**: `packages/webview/src/editor/blockHandlesExtension.ts`

---

## 5. キーボード操作仕様

### 5.1 block-type-menu（ブロック挿入メニュー）

スラッシュコマンド（`/`入力）または+ボタンクリックで表示されるメニュー。

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| メニューを開く | `/` | `/` | 空行または行頭で入力するとメニュー表示 | 高 |
| 上に移動 | `↑` | `↑` | 前のメニュー項目にフォーカス移動 | 高 |
| 下に移動 | `↓` | `↓` | 次のメニュー項目にフォーカス移動 | 高 |
| 選択確定 | `Enter` | `Enter` | フォーカス中の項目を選択してブロック挿入 | 高 |
| キャンセル | `Escape` | `Escape` | メニューを閉じて通常編集モードに戻る | 高 |
| フィルタリング | 文字入力 | 文字入力 | `/`の後に文字を入力してメニューをフィルタ | 高 |

### 5.2 block-context-menu / table-context-menu

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 上に移動 | `↑` | `↑` | 前のメニュー項目にフォーカス移動 | 高 |
| 下に移動 | `↓` | `↓` | 次のメニュー項目にフォーカス移動 | 高 |
| 選択確定 | `Enter` | `Enter` | フォーカス中の項目を実行 | 高 |
| キャンセル | `Escape` | `Escape` | メニューを閉じる | 高 |

### 5.3 テーブル操作

#### セル間移動

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 右のセルへ | `Tab` | `Tab` | 右隣のセルに移動（行末なら次行の先頭） | 高 |
| 左のセルへ | `Shift + Tab` | `Shift + Tab` | 左隣のセルに移動 | 高 |
| 下のセルへ | `↓` | `↓` | 真下のセルに移動 | 高 |
| 上のセルへ | `↑` | `↑` | 真上のセルに移動 | 高 |
| 最終セルでTab | `Tab`（最終セル） | `Tab`（最終セル） | 新しい行を追加 | 中 |

#### 行・列の追加・削除

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 上に行追加 | `Cmd + Shift + ↑` | `Ctrl + Shift + ↑` | 現在行の上に新しい行を挿入 | 高 |
| 下に行追加 | `Cmd + Shift + ↓` | `Ctrl + Shift + ↓` | 現在行の下に新しい行を挿入 | 高 |
| 左に列追加 | `Cmd + Shift + ←` | `Ctrl + Shift + ←` | 現在列の左に新しい列を挿入 | 高 |
| 右に列追加 | `Cmd + Shift + →` | `Ctrl + Shift + →` | 現在列の右に新しい列を挿入 | 高 |
| 行を削除 | `Cmd + Backspace` | `Ctrl + Backspace` | 現在行を削除 | 高 |

#### テーブルからの脱出

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| テーブルから脱出（下） | `Cmd + Enter` | `Ctrl + Enter` | テーブルの下に新しい段落を作成して移動 | 高 |
| セル内改行 | `Shift + Enter` | `Shift + Enter` | セル内で改行（ソフトブレイク） | 中 |

### 5.4 ブロック操作

#### ブロック選択

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 上のブロックも選択 | `Shift + ↑` | `Shift + ↑` | 選択範囲を上のブロックまで拡張 | 高 |
| 下のブロックも選択 | `Shift + ↓` | `Shift + ↓` | 選択範囲を下のブロックまで拡張 | 高 |
| 全ブロック選択 | `Cmd + A` | `Ctrl + A` | ドキュメント内の全ブロックを選択 | 高 |

#### ブロック移動

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| ブロックを上に移動 | `Cmd + Shift + ↑` | `Ctrl + Shift + ↑` | 現在のブロックを1つ上に移動 | 高 |
| ブロックを下に移動 | `Cmd + Shift + ↓` | `Ctrl + Shift + ↓` | 現在のブロックを1つ下に移動 | 高 |
| インデント追加 | `Tab` | `Tab` | ブロックのインデントを1レベル増加 | 高 |
| インデント削除 | `Shift + Tab` | `Shift + Tab` | ブロックのインデントを1レベル減少 | 高 |

#### ブロックタイプ変換

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 見出し1に変換 | `Cmd + Option + 1` | `Ctrl + Alt + 1` | 現在のブロックをH1に変換 | 高 |
| 見出し2に変換 | `Cmd + Option + 2` | `Ctrl + Alt + 2` | 現在のブロックをH2に変換 | 高 |
| 見出し3に変換 | `Cmd + Option + 3` | `Ctrl + Alt + 3` | 現在のブロックをH3に変換 | 高 |
| 段落に変換 | `Cmd + Option + 0` | `Ctrl + Alt + 0` | 現在のブロックを通常段落に変換 | 高 |
| 箇条書きに変換 | `Cmd + Shift + 8` | `Ctrl + Shift + 8` | 現在のブロックを箇条書きリストに変換 | 高 |
| 番号リストに変換 | `Cmd + Shift + 7` | `Ctrl + Shift + 7` | 現在のブロックを番号付きリストに変換 | 高 |
| 引用に変換 | `Cmd + Shift + .` | `Ctrl + Shift + .` | 現在のブロックを引用ブロックに変換 | 中 |

#### Markdown自動変換（行頭入力）

| 入力 | 変換結果 | 優先度 |
|------|----------|--------|
| `# ` + Space | 見出し1 | 高 |
| `## ` + Space | 見出し2 | 高 |
| `### ` + Space | 見出し3 | 高 |
| `- ` または `* ` + Space | 箇条書きリスト | 高 |
| `1. ` + Space | 番号付きリスト | 高 |
| `[] ` または `[ ] ` + Space | チェックリスト | 高 |
| `> ` + Space | 引用ブロック | 高 |
| ``` ` ` ` ``` + Enter | コードブロック | 高 |
| `---` + Enter | 水平線 | 中 |

### 5.5 テキスト編集

#### テキストフォーマット

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 太字 | `Cmd + B` | `Ctrl + B` | 選択テキストを太字に/太字解除 | 高 |
| 斜体 | `Cmd + I` | `Ctrl + I` | 選択テキストを斜体に/斜体解除 | 高 |
| インラインコード | `Cmd + E` | `Ctrl + E` | 選択テキストをコードに/コード解除 | 高 |
| 取り消し線 | `Cmd + Shift + S` | `Ctrl + Shift + S` | 選択テキストに取り消し線/解除 | 中 |
| 書式クリア | `Cmd + \` | `Ctrl + \` | 選択テキストの全書式を解除 | 中 |

#### リンク操作

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| リンク挿入 | `Cmd + K` | `Ctrl + K` | リンク挿入ダイアログを表示 | 高 |

### 5.6 その他

| 操作 | Mac | Windows/Linux | 動作説明 | 優先度 |
|------|-----|---------------|----------|--------|
| 元に戻す | `Cmd + Z` | `Ctrl + Z` | 直前の操作を取り消し | 高 |
| やり直し | `Cmd + Shift + Z` | `Ctrl + Y` | 取り消した操作をやり直し | 高 |
| 全選択 | `Cmd + A` | `Ctrl + A` | 全コンテンツを選択 | 高 |
| コピー | `Cmd + C` | `Ctrl + C` | 選択内容をコピー | 高 |
| 切り取り | `Cmd + X` | `Ctrl + X` | 選択内容を切り取り | 高 |
| 貼り付け | `Cmd + V` | `Ctrl + V` | クリップボードから貼り付け | 高 |
| プレーンテキスト貼り付け | `Cmd + Shift + V` | `Ctrl + Shift + V` | 書式なしで貼り付け | 高 |
| 保存 | `Cmd + S` | `Ctrl + S` | ドキュメントを保存 | 高 |

---

## 6. 実装優先度

### Phase 1（高優先度）- 基本操作
- スラッシュコマンド: ↑/↓ナビゲーション、Enter確定、Escapeキャンセル
- メニュー: ↑/↓ナビゲーション、Enter確定、Escapeキャンセル
- テーブル: Tab/Shift+Tabでのセル移動
- テキスト: 太字、斜体、インラインコード

### Phase 2（中優先度）- 拡張機能
- ブロック移動: Cmd+Shift+↑/↓
- テーブル: 行/列の追加・削除ショートカット
- ブロックタイプ変換: Cmd+Option+1-3

### Phase 3（低優先度）- 高度な機能
- 見出しジャンプ
- 検索/置換
- アウトライン表示

---

## 7. 今後の改善点

1. **キーボード競合の解決**: 同じキーバインドが複数コンテキストで使われる場合の優先順位を実装
2. **アクセシビリティ**: スクリーンリーダー対応
3. **Tiptap Pro検討**: 予算があれば公式拡張への移行を検討
