# 2026-01-14 ブロック共通ラッパー導入 + UI/同期修正

## 目的
- **全ブロックの UI を .block-handle-container + .block-content に統一**し、CSS 主導でハンドル位置を固定化。
- pre/table は構造制約が強いため **外側 wrapper** を持つ二層構造にする。
- メニュー2回クリック / Enter時の選択停滞 / ネストページ ack timeout を根本解決。
- 「失敗は即エラー」「完全ログ主義」を満たす。

---

## 実装方針（確定）
### 1) 2パターン統一
- **通常ブロック（p/h/blockquote/li 等）**
  - 既存要素の子として `.block-handle-container` + `.block-content` を挿入。
  - p/h は **span のみ**で内包（HTML 妥当性維持）。
- **pre/table 系**
  - 外側 wrapper を追加して `.block-content` に本体を内包。
  - `table` は `tbody` を contentDOM として維持。

### 2) NodeView 化
- paragraph/heading/blockquote/listItem/codeBlock/horizontalRule
- raw/frontmatter/plainText/html/nestedPage
- table は TableBlock で wrapper NodeView

---

## 変更点（主要）
### ブロック共通ラッパー
- `Paragraph/Heading/Blockquote/ListItem` NodeView: handle + block-content を内包。
- `CodeBlock/Raw/Frontmatter/PlainText/Html/NestedPage` NodeView: wrapper + block-content。
- `TableBlock` NodeView: wrapper + block-content + table/tbody (contentDOM)。

### インデント属性の反映
- NodeView 化により `data-indent` / `margin-left` が自動反映されなくなるため、
  `applyIndentAttributesToDom()` を導入し **全 NodeView に反映**。

### メニュー2回クリック問題
- ブロックハンドルは **pointerdown/up + 移動閾値**でクリック確定。
- `suppressNextDocumentClick` で即時クローズを防止。

### Enter 時の選択停滞
- `EnterSelectionFix` を追加。
  - inputType が insertParagraph/insertLineBreak かつ selection が動いていない場合のみ補正。
  - old selection を mapping 後に比較、`addToHistory=false` で履歴汚染を防止。

### ネストページ ack timeout
- `menuStateChange` は **v付きプロトコルメッセージ**で送信。
- `createNestedPage` は **要求元 panel のみ**に ack/created/failed を返却。
- 送信可否・配送状況をログで記録。

---

## 観測ログ強化
- Enter補正/ドラッグ/ネストページ送信の成功/失敗を時刻付きで記録。
- 失敗時はホスト通知で即エラー化。

---

## 既知リスク / 要確認
### Risk: Table wrapper DOM replacement
- Severity: High
- Impact: 列幅/セル選択/コピーが崩れるとテーブル操作が不可になる。
- Mitigation: UI 検証シナリオを事前に定義し、テーブル UI を固定化してから release。
- Owner: Table UI 担当
- Timeline: 次のリリース前（2026-01-22 まで）
- Validation criteria: `table` で列幅変更/セル選択/コピーが全て成立し、スクロール下でもズレないこと。
- Escalation criteria: UI テストで 1 件でも崩れが出たら即 rollback 検討。

### Risk: 大量ブロック時の NodeView パフォーマンス
- Severity: Medium
- Impact: 1k+ ブロックでスクロール/入力遅延が発生する可能性。
- Mitigation: 1k/5k ブロックでのベンチを実施し、NodeView の過剰更新を抑制する。
- Owner: Editor コア担当
- Timeline: 次回ベータ配布まで（2026-01-23 まで）
- Validation criteria: 1k/5k ブロックでスクロール FPS と入力遅延が許容範囲（体感遅延なし）であること。
- Escalation criteria: 体感遅延/フリーズが出たら NodeView 再設計に移行。

### Action: html-block ラベル二重化の整理
- Severity: Low
- Impact: DOM/CSS が二重化されて保守性が低下。
- Mitigation: `.html-block::before` を削除し `.html-block-label` に一本化。
- Owner: UI スタイル担当
- Timeline: 2026-01-22 まで
- Validation criteria: html-block ラベルが二重表示されず、表示が崩れないこと。
- Escalation criteria: ラベル崩れが確認されたら優先度を上げて対応。

### Action: Frontmatter ラベル表記の見直し
- Severity: Low
- Impact: RAW と同じ表記で混同を招く。
- Mitigation: `Frontmatter` / `YAML` / `Metadata` など候補を提示し UI で選定。
- Owner: UI/UX 担当
- Timeline: 2026-01-22 まで
- Validation criteria: Frontmatter ラベルが明確になり RAW と区別できること。
- Escalation criteria: 混同報告があれば即再デザイン。

---

## 参照
- ProseMirror NodeView 仕様（contentDOM の原則）
- 2026-01-13 ブロック共通ラッパー設計
- Outputログ（menuStateChange/createNestedPage invalid, ack timeout）
