# 2026-01-13 ブロック共通ラッパー設計（block-handle-container + content）

## 目的
- 全ブロックを **「ハンドル列 + コンテンツ列」**の2カラム構造で統一。
- ハンドル位置を CSS 主体で安定させ、JS 依存を最小化。
- 既存スタイルは `content` 側に集約し、ハンドルは共通コンポーネントで扱う。

---

## 前提・制約
- Tiptap/ProseMirror の DOM は **ノード種別ごとに制約**がある（`pre`, `table`, `li` 等）。
- セマンティクス（`li` の marker）や ProseMirror の編集互換性を壊さないことが最優先。
- 失敗は即エラー。フォールバックで延命しない。

---

## 共通構造（理想形）
```
.block-handle-host
  .block-handle-container   // +ボタン + ドラッグハンドル
  .block-content            // 既存のスタイルはここへ
```

### 共通化できるもの
- `.block-handle-container` の生成とイベント処理
- `.block-content` に適用する typographic / spacing / color の大半
- hover/focus の表示制御

### 例外になりやすいもの
- `pre` / `table` / `li` など **構造・セマンティクス制約**が強いノード
- NodeView を持つ既存ブロック（raw/frontmatter/plaintext/nestedPage 等）

---

## パターン分け（実装単位）

### A) 既存の通常ブロック（paragraph/heading/blockquote など）
**方式:** NodeView を導入して上記2カラム構造を厳密に作る
- `contentDOM` を `.block-content` に割り当てる
- `block-handle-container` は NodeView の DOM 直下に配置

**メリット**
- DOM 構造が一貫する（理想形）
- CSS で `content` だけを操作できる

**デメリット**
- NodeView が増える（パフォーマンス負荷）
- update/ignoreMutation 実装が必要

### B) セマンティクス制約ブロック（listItem/ul/ol）
**方式:** `li` の DOM を壊さない構成を維持
- `li` 自体を `.block-handle-host` にする
- `block-handle-container` を `li` 直下に差し込む（Decoration.widget）
- `content` は **ラップしない**（marker を壊さない）

**スタイル対応**
- `li::before` / marker の位置は `block-handle-gutter` を考慮した padding 調整
- `li` には `padding-left: var(--block-handle-gutter) + marker幅` を適用

### C) pre/table（構造的に内包が特殊）
**方式:** 1つ外側に wrapper を追加して2カラム構造を確保
```
.block-handle-host
  .block-handle-container
  .block-content
    pre / table
```

- pre/table 直下に handle を置かない
- 既存 CSS は `.block-content` に移す

### D) NodeView 系ブロック（raw/frontmatter/plaintext/nestedPage 等）
**方式:** 既存 NodeView の DOM を **統一ラッパーに寄せる**
- NodeView DOM を「Aパターン」に合わせる
- すでに独自 label/UI を持つので衝突が少ない

---

## NodeView 導入のパフォーマンス評価

### 影響の方向性
- **NodeView増 = DOM ノード増 + update呼び出し増**
- ただし **各 NodeView が軽量で、update が true/false だけ返すなら負荷は限定的**

### 実測系の観点
- 1ドキュメント数百〜千ブロック程度なら現実的
- 長文で 1万ブロック級になると明確に負荷が出る可能性

### 設計上の妥協点（推奨）
- まずは **ハンドル制御に必要な最小限の NodeView** だけ導入
- performance が問題なければ段階的に拡張

---

## 実装ステップ（提案）
1. **NodeView化対象のノード一覧を決定**
   - paragraph / heading / blockquote / codeBlock / table / listItem / etc
2. **共通 wrapper コンポーネント**を作成（block DOM）
3. **NodeView 更新処理の最小実装**（update/ignoreMutation）
4. 既存 CSS の `block-handle-host` 直下 → `.block-content` へ移行
5. listItem 用の marker 調整と hover 範囲検証

### Migration Strategy
- **in-place**: 既存ドキュメントは再パース時に新 wrapper を付与（保存時に旧構造は消える）
- listItem は **構造維持**（marker 破壊を避ける）。必要な場合のみ listItem 内の block を wrapper 化
- 互換性が必要なら **feature flag** で旧/新の NodeView を切替（同一 markdown から両方生成可能）

### Testing Plan
- Unit: NodeView `update` / `ignoreMutation` / `stopEvent` の挙動
- Integration: パターン A–D を含むドキュメントで編集/ドラッグ/メニューが成立すること
- Visual: CSS 移行後に block/handle/marker のズレがないかスクショ差分で確認

### Rollback Plan
- **feature flag** で旧構造に即時切替
- パフォーマンス劣化（1k+ blocks）や drag 不安定化が出たら旧構造へ戻す
- Markdown 互換性は維持（wrapper はレンダリング層のみ、保存フォーマットは同一）

---

## この設計で明確にしておくこと
- `listItem` は **wrapper を作らず** marker を維持（構造破壊しない）
- `pre/table` は **必ず wrapper を追加**（pre直下の handle は不可）
- NodeView は **最小限から導入**し、問題なければ拡大

---

## 次の決定待ち
- NodeView を **全ブロックで一気に導入**するか、段階導入にするか
- 既存 CSS の移行範囲（`content` に移す具体ルール）
