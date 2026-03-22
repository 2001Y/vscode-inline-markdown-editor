# 2026-03-22 ハンドル重なり問題 設計再検討ログ

## 目的

- 「ハンドルが文字にかぶる」問題について、外部相談を併用しながら解決方針を慎重に比較検討する。
- その検討過程を、後から追跡できる形で step-by-step に記録する。

## 進め方

1. 既存の `_docs` と git 履歴から、内部で分かっている事実を固定する。
2. 現在の構造に対して、どの設計案があり得るかを整理する。
3. 外部相談を行い、公式情報・公開知見と照らして比較する。
4. 案ごとの利点 / 欠点 / リスク / 実装コストを評価する。
5. 最終的な推奨案と、次にやるべき最小実装単位を決める。

## Step 1. 内部で固定できている事実

- 現在のハンドルは `Decoration.widget(...)` で生成され、本文側 `contentDOM` に差し込まれている。
- `.block-handle-host` / `.block-content` / `.block-handle-container` の見た目は 2 カラム構造に近いが、実体としては本文レイヤーとハンドルレイヤーが完全分離されていない。
- 2026-01-10 以降、list marker / heading / blockquote / code block で繰り返し位置ズレや重なりが調整されている。
- 履歴調査は [2026-03-22-handle-overlap-history.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-history.md) にまとめた。

## Step 2. 現時点での設計候補

### 案A. 現行構造を維持し、CSS オフセットだけで押し切る

- 例: `left` / `margin-left` / `padding-left` を再調整する。
- 想定メリット:
  - 変更量が小さい。
- 想定リスク:
  - node type ごとの再調整が続きやすく、再発しやすい。

### 案B. `block-content` に本当の左ガターを持たせる

- 本文列そのものにハンドル用の固定ガターを予約する。
- 想定メリット:
  - handle が本文開始位置を侵食しにくくなる。
- 想定リスク:
  - list / code / table / blockquote で text start が異なるため、共通化に失敗すると別のズレが出る。

### 案C. ハンドルを本文レイヤーの外へ出す

- `block-handle-container` を `contentDOM` と兄弟関係にする。
- 想定メリット:
  - 本文とハンドルの座標系を分離できる。
- 想定リスク:
  - ProseMirror / NodeView / Decoration の責務を整理し直す必要がある。

### 案D. 旧 overlay 型へ戻す

- 独立オーバーレイとして handle を浮かせる。
- 想定メリット:
  - 本文と完全分離できる。
- 想定リスク:
  - ProseMirror 管理外 DOM の扱いで過去に問題化している。

## Step 3. 外部相談の問い

- `Decoration.widget` を本文側に差し込む構造のまま、安定して本文との重なりを防ぐのは現実的か。
- Tiptap / ProseMirror の Custom Editor で、block handle を sibling column として持つのは妥当か。
- NodeView shell と widget overlay の混在は長期的に保守しやすいか。
- このリポジトリでは、案A/B/C/D のどれが最も単純で再発しにくいか。

## Step 4. 外部相談ログ

### 4-1. 外部相談 #1 実行

- 実行日時: 2026-03-22 12:20 UTC
- 使用: `coding-confidant`
- 保存先:
  - [openai.jsonl](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/_skills/coding-confidant/20260322T122035Z-16046/openai.jsonl)
  - [repomix-output.xml](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/_skills/coding-confidant/20260322T122035Z-16046/repomix-output.xml)
- 送信した主文脈:
  - 現在のコード
    - `packages/webview/src/styles.css`
    - `packages/webview/src/editor/inlineDragHandleExtension.ts`
    - `packages/webview/src/editor/blockHandlesExtension.ts`
    - `packages/webview/src/editor/disableKeyboardShortcuts.ts`
  - 今回まとめた調査メモ
    - [2026-03-22-handle-overlap-debug.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-debug.md)
    - [2026-03-22-handle-overlap-history.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-history.md)
    - [2026-03-22-handle-overlap-design-review.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-design-review.md)
  - 過去の設計メモ
    - [2026-01-13-block-handle-wrapper-design.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-01-13-block-handle-wrapper-design.md)
    - [2026-01-14-block-wrapper-implementation.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-01-14-block-wrapper-implementation.md)
    - [2026-02-04-handle-active-changeguard-vsix.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-02-04-handle-active-changeguard-vsix.md)
    - [2026-02-07-preview-handle-frontmatter-alignment-fix.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-02-07-preview-handle-frontmatter-alignment-fix.md)
- 依頼内容:
  - 案A/B/C/D を比較
  - 一次情報を優先
  - repo 所見と Web 根拠を分離
  - 単純さ / 再発しにくさ / ProseMirror/Tiptap 整合性 / VS Code webview 整合性 / 移行コスト / repo 適合性で評価
  - 最後に推奨順と最小移行ステップを提示

### 4-2. ステータス

- 回答受領済み

### 4-3. 外部相談 #1 の要点

- repo 所見:
  - 現状は `Decoration.widget` が本文 `contentDOM` 側に入る一方、CSS と NodeView は 2 カラム構造へ寄せようとしており、そこが構造的不一致になっている。
  - 2026-02-04 の時点でも「widget を 1 件化しても、余白は CSS 側で別途必要」と自覚している。
- Web 根拠:
  - ProseMirror の widget は文書位置にひもづく付加 DOM であり、本文のレイアウト列そのものを自然に分離する仕組みではない。
  - NodeView + `contentDOM` + sibling UI は ProseMirror/Tiptap の正道。
  - Tiptap DragHandle は overlay/floating 前提で、左側に物理余白がなければ本文と重なり得る。
- 外部評価:
  - 1位: 案C `handle を contentDOM の外へ出して sibling 化`
  - 2位: 案B `block-content に本物の左ガター`
  - 3位: 案D `overlay/floating へ戻す`
  - 4位: 案A `CSS オフセットだけで押し切る`
- 理由:
  - 案Cだけが「見かけ 2 カラム」と「実体 2 カラム」を一致させられる。
  - 案Bは改善するが、座標系共有の根は残る。
  - 案Dは成立するが、結局ガター discipline が必要。
  - 案Aは履歴的に再発率が高い。

## Step 5. 暫定判断

- まだ確定しない。外部相談後に更新する。

## Step 6. 評価マトリクス

### 案A. 現行構造 + CSS オフセット調整

- 単純さ: 高
- 再発しにくさ: 低
- ProseMirror/Tiptap 整合性: 中
- VS Code webview 整合性: 中
- 移行コスト: 低
- repo 適合性: 低〜中
- コメント:
  - 最安だが短命。履歴上、heading / blockquote / list / code ごとの微調整が積み上がっており、再発パターンを繰り返しやすい。

### 案B. `block-content` に左ガター

- 単純さ: 中
- 再発しにくさ: 中
- ProseMirror/Tiptap 整合性: 中〜高
- VS Code webview 整合性: 高
- 移行コスト: 中
- repo 適合性: 中
- コメント:
  - 物理余白の常設で衝突を減らせる。
  - ただし handle が `contentDOM` 側にいる限り、座標系共有の問題は残る。

### 案C. handle を `contentDOM` の外へ出して sibling 化

- 単純さ: 中
- 再発しにくさ: 高
- ProseMirror/Tiptap 整合性: 高
- VS Code webview 整合性: 高
- 移行コスト: 中〜高
- repo 適合性: 高
- コメント:
  - repo が元々目指していた 2 カラム理想構造と一致する。
  - 根本原因の「見かけ 2 カラム / 実体は本文内 widget」を解消できる。

### 案D. 独立 overlay / floating handle へ戻す

- 単純さ: 中
- 再発しにくさ: 中〜高
- ProseMirror/Tiptap 整合性: 高
- VS Code webview 整合性: 高
- 移行コスト: 中
- repo 適合性: 中
- コメント:
  - Tiptap の DragHandle 方針には沿いやすい。
  - ただし左側余白を別に確保しないと、別形式で重なりを再生産しうる。

## Step 7. 最終推奨

- 現時点の 1 位は案C。
- 判断理由:
  - 2 カラムの理想形を DOM 実体にも反映できる。
  - NodeView + `contentDOM` + sibling UI という正攻法に戻せる。
  - 過去の個別オフセット修正の連鎖を止めやすい。

## Step 8. 推奨案Cの最小移行ステップ

1. paragraph / heading / blockquote を第1弾として対象化する。
2. `block-handle-host` の中に `block-handle-container` と `block-content` を sibling で持つ共通 NodeView shell を作る。
3. 現行の `Decoration.widget` による handle 生成を対象ノードから外す。
4. CSS を「見かけ 2 カラム」ではなく「実体 2 カラム」前提へ整理する。
5. hover / activePos / drag target 解決を新しい NodeView DOM に合わせて差し替える。
6. listItem / code / table は第2弾として例外ルール込みで移行する。
7. feature flag で旧構造と切り替えられるようにして段階検証する。

## Step 9. 外部相談 #2

### 9-1. 実行

- 実行日時: 2026-03-22 12:22 UTC
- 使用: `coding-confidant`
- 保存先:
  - [openai.jsonl](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/_skills/coding-confidant/20260322T122238Z-17244/openai.jsonl)
  - [repomix-output.xml](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/_skills/coding-confidant/20260322T122238Z-17244/repomix-output.xml)
- 依頼内容:
  - 案Cだけに絞る
  - paragraph / heading / blockquote / listItem / codeBlock / table の導入優先順を評価
  - listItem と table/pre 系を後回しにして良いかを確認
  - 破壊点を `DOM妥当性 / selection / dragstart-drop / IME / a11y / CSS退行` で列挙
  - この repo 向けの導入順序つき実装計画を出させる

### 9-2. 回答要点

- 第1弾に入れるべき:
  - `paragraph`
  - `heading`
  - `blockquote`
- 後回しでよい:
  - `listItem`
  - `codeBlock`
  - `table`
- 理由:
  - paragraph / heading / blockquote は NodeView shell を sibling 化しても DOM 制約が比較的緩く、移行リスクが最小。
  - listItem は marker / indent / drag 深さ補正の制約が強い。
  - codeBlock は `pre > code` と selection / IME / copy の退行リスクがある。
  - table は cell selection / resize / copy / drag と競合しやすく、最後に専用対応すべき。

### 9-3. 破壊点の整理

- DOM 妥当性:
  - `contentDOM` には編集対象のみを置き、handle 側は `contentEditable=false` を徹底する必要がある。
- selection:
  - `stopEvent` は ProseMirror への伝播抑止であり、`preventDefault` の代替ではない。
- dragstart / drop:
  - handle 側で dragover を握り過ぎると dropcursor を壊しうる。
- IME:
  - 合成入力は `contentDOM` 内で閉じる必要がある。
- a11y:
  - handle ボタンには `aria-label`, keyboard support, focus return が必要。
- CSS 退行:
  - 現在の「見かけ2カラム」向けオフセット群を、「実体2カラム」前提へ整理し直す必要がある。

### 9-4. ここまでの判断

- 案Cを採るなら、最初に paragraph / heading / blockquote のみを移行する。
- listItem / codeBlock / table を最初から同時に触るのは危険。
- したがって、最小の安全単位は「NodeView shell の共通化 + 3ノードだけ sibling 化 + feature flag」である。

## Step 10. 現時点の推奨計画

1. 共通 NodeView shell を作る。
2. paragraph / heading / blockquote を新 shell に移す。
3. その3ノードで `Decoration.widget` 依存を外す。
4. CSS を「実体2カラム」前提へ整理する。
5. hover / activePos / drag target 解決を新 DOM に合わせる。
6. feature flag で旧構造と並走させる。
7. codeBlock を第2弾、listItem を第2弾後半、table を第3弾で扱う。

## Step 11. checkpoint commit

- 目的:
  - ここまでの調査 md を一旦戻せる状態で固定する。
- 実行:
  - commit: `e713420`
  - message: `docs: record handle overlap investigation`
- 含めたもの:
  - [2026-03-22-handle-overlap-debug.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-debug.md)
  - [2026-03-22-handle-overlap-history.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-history.md)
  - このファイル
- 含めなかったもの:
  - 既存の `issue.md` 変更
  - 他の dirty worktree の変更

## Step 12. 実装 #1

### 12-1. 実施内容

- 第1弾として `paragraph / heading / blockquote` に static handle container を導入した。
- NodeView 内で `createDragHandleElement()` を使い、handle を `contentDOM` の sibling として生成するようにした。
- `InlineDragHandle` 側では `paragraph / heading / blockquote` を widget 生成対象から除外した。
- `blockHandlesExtension` / `inlineDragHandleExtension` の pos 解決では、NodeView 由来 handle には `data-block-source=nodeview` を付け、dataset の `blockPos` を優先するようにした。

### 12-2. 変更ファイル

- [disableKeyboardShortcuts.ts](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/editor/disableKeyboardShortcuts.ts)
- [inlineDragHandleExtension.ts](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/editor/inlineDragHandleExtension.ts)
- [blockHandlesExtension.ts](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/editor/blockHandlesExtension.ts)

### 12-3. 狙い

- 少なくともこの3ノードでは、「見かけ 2 カラム」ではなく「実体 2 カラム」に近い構造へ寄せる。
- 同時に、既存の menu / drag 解決系ロジックを大きく壊さずに流用する。

### 12-4. 検証

- `npm run lint -w packages/webview` 成功
- `npm run build -w packages/webview` 成功

### 12-5. 現時点の残課題

- CSS はまだ旧来の「widget 1件表示」と「static handle」の混在状態を前提にしている。
- 実機で hover / drag / context menu の挙動確認は未実施。
- listItem / codeBlock / table は未着手。

## Step 13. VSIX 化

- 実行:
  - `npm run package`
- 結果:
  - 成功
  - 生成物: [inlinemark-0.1.3.vsix](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/extension/inlinemark-0.1.3.vsix)

## Step 14. 今回の確認観点

- paragraph / heading / blockquote で、handle が本文に重ならず左ガター内に収まること
- paragraph / heading / blockquote で、hover 時にだけ `+ / grip` が出ること
- 同3ノードで `+` メニューと grip の context menu が動くこと
- 同3ノードで dragstart / drop が従来通り成立すること
- listItem / codeBlock / table はまだ旧構造のままで、今回の変更で退行していないこと

## Step 15. 第1弾の実機確認結果

- paragraph / heading / blockquote は問題なく動作していることを確認済み。
- 第1弾の sibling handle 化は継続可能と判断する。

## Step 16. 実装 #2

- 次の対象は `codeBlock`。
- 理由:
  - 第2弾候補の中では、listItem / table より構造制約が弱い。
  - 一方で `pre > code` と selection / IME / copy の退行リスクがあるため、単独で切り出して確認する価値がある。

### 16-1. 実施内容
- `CodeBlockNoShortcut` の NodeView に static handle container を追加した。
- `codeBlock` を `InlineDragHandle` の widget 対象から除外した。
- これにより `codeBlock` でも handle が `contentDOM` の sibling になる構造へ寄せた。

### 16-2. 検証
- `npm run lint -w packages/webview` 成功
- `npm run build -w packages/webview` 成功

### 16-3. 次の確認観点
- codeBlock で handle が本文に重ならないこと
- codeBlock で hover 時だけ `+ / grip` が出ること
- codeBlock で drag が従来通り成立すること
- codeBlock で label 編集、選択、IME、コピーが退行していないこと

## Step 17. 最新 VSIX
- 実行:
  - `npm run package`
- 結果:
  - 成功
  - 生成物: [inlinemark-0.1.3.vsix](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/extension/inlinemark-0.1.3.vsix)

## Step 18. 実装 #3
- `table` を除く残りの NodeView 系にも sibling handle を広げた。

### 18-1. 今回追加した対象
- `listItem`
- `horizontalRule`
- `frontmatterBlock`
- `rawBlock`
- `plainTextBlock`
- `nestedPage`

### 18-2. 実施内容
- 各 NodeView の wrapper 先頭に static handle container を追加した。
- `InlineDragHandle` 側では上記ノードを widget 生成対象から除外した。
- `frontmatter / raw / plainText / nestedPage` は wrapper 型のため、paragraph 系と同じ発想で sibling handle 化した。
- `listItem` は `li` を host としたまま static handle を差し込む形に留めた。

### 18-3. 検証
- `npm run lint -w packages/webview` 成功
- `npm run build -w packages/webview` 成功
- `npm run package` 成功

### 18-4. 今回あえて触っていないもの
- `table`
- 理由:
  - 外部相談どおり、cell selection / resize / copy / drag の競合リスクが最も高い。
  - このノードだけは専用に切り出して検討した方が安全。

### 18-5. 次の確認観点
- `listItem` で marker と handle が再衝突していないこと
- `listItem` の drag / indent / outdent が退行していないこと
- `horizontalRule` で handle と選択が破綻しないこと
- `frontmatter / raw / plainText / nestedPage` で label / button / preview / open action が退行していないこと
- `table` が今回の変更で巻き添え退行していないこと

## Step 19. 実装 #4
- 最後に `table` も sibling handle 化した。

### 19-1. 実施内容
- `TableBlock` の wrapper 先頭に static handle container を追加した。
- `table` を `InlineDragHandle` の widget 生成対象から除外した。
- `table` 本体の `tbody` は引き続き `contentDOM` として維持した。

### 19-2. 狙い
- `table` でも main block handle を本文レイヤー外へ出す。
- 既存の row/column handles と table selection の仕組みは維持する。

### 19-3. 検証
- `npm run lint -w packages/webview` 成功
- `npm run build -w packages/webview` 成功
- `npm run package` 成功
- 最新生成物: [inlinemark-0.1.3.vsix](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/extension/inlinemark-0.1.3.vsix)

### 19-4. 今回の確認観点
- `table` の main block handle が本文や枠線に重ならないこと
- `table` の row handle / column handle と main block handle が致命的に干渉しないこと
- `table` の cell selection / resize / copy / drag が退行していないこと

## Step 20. 0.1.2 公開
- 目的:
  - 公開済み `0.1.1` の次として `0.1.2` を Marketplace に公開する。
- 実施:
  - `packages/extension/package.json` の version を `0.1.2` に設定
  - `package-lock.json` の `packages/extension.version` も `0.1.2` に更新
  - `npm run package`
  - `npx vsce publish -i packages/extension/inlinemark-0.1.2.vsix --skip-duplicate`
- 結果:
  - Publish 成功
  - Marketplace URL: https://marketplace.visualstudio.com/items?itemName=2001y.inlinemark
  - Hub URL: https://marketplace.visualstudio.com/manage/publishers/2001y/extensions/inlinemark/hub
  - 公開版: `2001y.inlinemark v0.1.2`
- 補足:
  - Marketplace 側の表示反映には数分かかる場合がある。
