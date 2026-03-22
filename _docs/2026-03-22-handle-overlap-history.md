# 2026-03-22 ハンドル重なり問題の履歴調査

## 目的
- 現在の「ハンドルが文字にかぶる」問題について、過去の設計判断と実装変遷を時系列で整理する。
- どの変更が現在の症状につながったかを、`_docs` と git 履歴の両方から特定する。

## 調査対象
- `packages/webview/src/styles.css`
- `packages/webview/src/editor/inlineDragHandleExtension.ts`
- `packages/webview/src/editor/blockHandlesExtension.ts`
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
- `_docs` 内のハンドル関連メモ
- git commit / blame / `-S` 履歴

## エグゼクティブサマリー
- この問題は単発の CSS バグではなく、**ハンドルをどのレイヤーに置くか**という設計が複数回変わった結果として再発している。
- 大きな流れは次の通り。
  1. 2026-01-09 時点では、ハンドルは独立した絶対配置オーバーレイとして導入された。
  2. 2026-01-11 に ProseMirror 管理下へ入れるため `Decoration.widget` へ寄せた。
  3. 2026-01-13 から 2026-01-15 にかけて、「ハンドル列 + コンテンツ列」の2カラム構造へ寄せる設計が検討・導入された。
  4. 2026-01-19 から 2026-01-20 にかけて、見出し・引用・リスト・コードブロックで個別調整が増え、症状対応が積み重なった。
  5. 2026-01-28 の大規模変更で `.block-handle-container` / `.block-handle-host` / `.block-content` が本格導入された。
  6. 2026-02-04 にアクティブ1件表示へ寄せた結果、`Decoration.node` の host と `Decoration.widget` の handle に再び依存する構造が前面に出た。
  7. 2026-02-07 に padding/gutter と text start 計測の調整が入ったが、根本のレイヤー不整合は残った。
- 現在の問題は、**「2カラム構造にしたい」設計意図**と、**実際には handle widget が contentDOM 側へ差し込まれる実装**が食い違っていることが主因。

## 現在の根本原因
### 1. 目指していた構造と実装構造が一致していない
- 理想形としては、`block-handle-host` の中に「ハンドル列」と「本文列」を分ける構造が何度も設計されている。
- しかし現在の実装では、ハンドルは `Decoration.widget(...)` により本文ノードの `contentDOM` 側に入っており、実際には本文と同じ座標系を共有している。
- そのため、`block-handle-host` に付けた padding は「本文を押しのける余白」ではなく、見た目上の外枠調整にしかなっていない。

### 2. 2026-01-28 以降の host/content 導入で「列分離したように見える」状態になった
- `.block-handle-container` / `.block-handle-host` / `.block-content` の導入により、CSS 上は列分離したように読める。
- ただし handle 実体は widget で差し込まれるため、DOM 実体としては「列分離」ではなく「本文の上に重なる絶対配置」である。

### 3. 以後の修正が構造修正ではなくオフセット調整中心になった
- 見出しの margin、blockquote の padding、list marker との衝突回避、`resolveBlockTextStartX` の改善など、各ブロック種別ごとの微調整が増えた。
- これは症状緩和には効くが、根本の「widget が本文側にある」構造を変えていないため、別ノード種別や別 CSS 変更で再発しやすい。

## 時系列
### 2026-01-09 初期導入
- コミット: `1fe992d` `fix: resolve BubbleMenu display bug and implement block handles`
- 内容:
  - ブロックハンドルが新規導入された。
  - 当時の CSS は `.block-handle` 単体を `position: absolute` で扱うオーバーレイ型。
  - `git show 1fe992d:packages/webview/src/styles.css` では、`.block-handle` 自体が絶対配置・高 z-index のドラッグ UI になっている。
- 意味:
  - この段階では「ハンドル列 + 本文列」の明示的分離はまだない。
  - まずはハンドルを出すことが主目的で、重なり問題を構造で解く段階ではなかった。

### 2026-01-10 公式 DragHandle / 独自実装 / Decoration の比較検討
- 参考メモ:
  - `_docs/2026-01-10-ui-handle-table-o3.md`
  - `_docs/2026-01-10-handle-menu-o3.md`
  - `_docs/2026-01-10-draghandle-dropcursor-design.md`
  - `_docs/2026-01-10-list-marker-css.md`
- 当時の論点:
  - list marker とハンドルが衝突する。
  - テーブルは別 UI として分離したい。
  - `@tiptap/extension-drag-handle` を使うか、自前実装を継続するか検討していた。
  - listItem では marker とハンドルの競合が最初期から問題化していた。
- 意味:
  - 「ハンドルが本文や marker と重なる」問題は、少なくとも 2026-01-10 には既に顕在化していた。
  - この時点で、問題は単なる CSS 値ではなく「アンカー位置と DOM 構造」にあると認識されていた。

### 2026-01-11 ProseMirror 管理下へ寄せる判断
- 参考メモ: `_docs/2026-01-11-inline-draghandle-visibility-fix.md`
- 内容:
  - `editor.view.dom` 配下に未知の DOM を直接 append すると ProseMirror に除去されうるため、`Decoration.widget` を使う方針へ転換した。
  - ここで「handle layer を widget でマウントする」という基本路線が確定した。
- 意味:
  - この判断自体は正しい。
  - ただし、この時点で「widget は本文 DOM に寄生する」性質を持つため、のちの 2 カラム構造と緊張関係が生まれた。

### 2026-01-13 理想形としての 2 カラム設計
- 参考メモ: `_docs/2026-01-13-block-handle-wrapper-design.md`
- 内容:
  - 明確に次の理想構造が定義された。

```text
.block-handle-host
  .block-handle-container
  .block-content
```

- 目的:
  - ハンドル位置を CSS 主体で安定化。
  - 既存スタイルは `.block-content` に集約。
  - ハンドルは共通コンポーネントとして扱う。
- 重要点:
  - listItem、pre、table、NodeView 系で例外パターンまで丁寧に分けている。
  - つまりこの時点で、問題の本質が「座標調整」ではなく「DOM 構造統一」にあることは理解されていた。

### 2026-01-14 2 カラム設計の実装
- 参考メモ: `_docs/2026-01-14-block-wrapper-implementation.md`
- 内容:
  - `Paragraph/Heading/Blockquote/ListItem` NodeView に handle + block-content を持たせる方針。
  - `CodeBlock/Raw/Frontmatter/...` は wrapper + block-content。
  - `TableBlock` も wrapper 型。
- 意味:
  - ここで一度、「すべてのブロックを共通 shell に寄せる」方向へ大きく舵が切られた。
  - 以後のハンドル問題は、この理想構造をどこまで実装できたか、どこで崩れたかで読むべき。

### 2026-01-15 block-content へのスタイル移行
- 参考メモ:
  - `_docs/2026-01-15-block-content-style-handle-scope-nested-open.md`
  - `_docs/2026-01-15-block-handle-style-fix.md`
- 内容:
  - block-content に見た目を集約。
  - `block-handle-host` に gutter を持たせる整理が進んだ。
  - 一方で NodeView 化後に CSS セレクタが外れ、ハンドルスタイルが当たらない問題も起きている。
- 意味:
  - DOM 構造変更に CSS が追随できず、ハンドル周りはすでに不安定化していた。
  - ここから先は、構造変更と CSS 追随のズレが慢性化している。

### 2026-01-19 〜 2026-01-20 レイアウト症状への個別対応期
- 参考メモ:
  - `_docs/2026-01-19-handle-drag-debug-logging.md`
  - `_docs/2026-01-19-drag-drop-heading-blockquote-fix.md`
  - `_docs/2026-01-19-link-drag-heading-blockquote-fix.md`
  - `_docs/2026-01-20-handle-center-tight-spacing-codeblock-label.md`
- 内容:
  - 見出しでハンドルが出ない、縦位置がズレる、blockquote の余白が過剰、drag が不発、などの症状が連続している。
  - 見出しの margin/padding、blockquote の padding、ハンドルの上下中央配置、list や code block の個別調整が続いた。
- 意味:
  - ここでは構造を再整理するより、症状ごとのオフセット・余白調整に比重が移っている。
  - 長期的には、このフェーズが「症状対応の蓄積」を増やした。

### 2026-01-28 大規模再編成
- コミット: `67a410c`
- git diff 規模:
  - `inlineDragHandleExtension.ts` 1945 行規模の大改修
  - `disableKeyboardShortcuts.ts` 808 行規模
  - `styles.css` 485 行規模
- 導入/定着した要素:
  - `.block-handle-container`
  - `.block-handle-host`
  - `.block-content`
  - ListItem など各 NodeView で `contentDOM` を `block-content` に寄せる構造
- 履歴根拠:
  - `git log -S 'block-handle-host'`
  - `git log -S 'block-handle-container'`
  - `git log -S 'block-content'`
- 意味:
  - 現在の設計の土台はこのコミットでほぼ確立している。
  - ただし `git show 67a410c:packages/webview/src/editor/inlineDragHandleExtension.ts` では、handle は依然として `Decoration.widget` で差し込まれている。
  - つまり **見た目は2カラム、実体は widget overlay** というハイブリッド構造がここで成立した。

### 2026-02-04 アクティブ1件表示への寄せ戻し
- 参考メモ:
  - `_docs/2026-02-04-handle-active-changeguard-vsix.md`
  - `_docs/2026-02-04-handle-unknownblock-fix.md`
- 内容:
  - アクティブ1件のみハンドル表示する設計へ変更。
  - ドキュメントには明確に次が書かれている。
    - `Decoration.node` で host を付ける
    - `Decoration.widget` でハンドルを1件だけ出す
    - その場合、padding は CSS 側で共通に与える必要がある
- 重要な示唆:
  - この時点で、**handle の配置が Decoration 依存であること**と、**余白は CSS 依存で補うしかないこと**が明文化されている。
  - これは現在の再発構造と一致する。

### 2026-02-07 preview まわりの CSS 共通化で再びガター設計が揺れた
- 参考メモ:
  - `_docs/2026-02-07-preview-handle-frontmatter-alignment-fix.md`
  - `_docs/2026-02-07-preview-ui-csp-table-followup.md`
- 内容:
  - `> :not(.ProseMirror-widget):not(ul):not(ol)` の個別セレクタを削除
  - 代わりに `> .block-handle-host` へ統一的に左右 gutter を適用
  - `resolveBlockTextStartX` を、`block-content -> 直下のテキスト系要素 -> host` の順で解決するよう変更
- 意味:
  - 2 月上旬の時点でも、「host padding と実際の text start がズレる」ことが問題として認識されていた。
  - つまり、現在の重なりは突然の退行ではなく、当時から続く未完の構造問題の延長線上にある。

### 2026-03-22 現在のワークツリー
- 重要点:
  - 現在のワークツリーには未コミット変更が含まれている。
  - `git blame` 上では、以下が `Not Committed Yet` になっている。
    - `activePos` 前提の1件表示ロジック
    - `.block-handle-container.is-active`
    - `.inline-markdown-editor-content > .block-handle-host` の padding 付与
- 意味:
  - 現在ユーザーが見ている症状は、単一コミットではなく、**2026-01-28 基盤 + 2026-02-04 系の1件化ロジック + 2026-02-07 系のガター調整 + 現在の未コミット差分**が合成された結果である。

## 根本原因の一覧
### A. ハンドルレイヤーが本文レイヤーの外へ完全に分離されていない
- 理想は `handle column` と `content column` の分離。
- 実装は `Decoration.widget` による本文側差し込み。
- この不一致が、すべてのズレの出発点になっている。

### B. `block-handle-host` の padding が「handle を置く列」ではなく「外枠の余白」になっている
- widget は `contentDOM` 側にいるため、host padding を増やしても handle の衝突は構造的には解決しない。
- 一部ノードでは見かけ上改善しても、別ノードで再発する。

### C. `block-content` の text start と host start が一致しない
- `pre`, `blockquote`, `table`, `li`, heading などは text start が host start と異なる。
- これにより、`left: 0` のハンドルが本文先頭と衝突しやすい。
- 2026-02-07 に `resolveBlockTextStartX` が強化されたのは、このズレを計測で吸収しようとした証拠。

### D. 微調整がノード種別ごとに増え、全体整合が崩れやすくなった
- heading margin
- blockquote padding
- list marker と padding-left
- code block / frontmatter / raw shell
- これらが個別修正されるほど、共通構造の破綻は見えにくくなるが、再発確率は上がる。

### E. 現在のワークツリーは未コミット差分を含む
- そのため、ドキュメントだけでは説明し切れず、現在の実装は「履歴に残った設計」と「まだ固まっていない作業中変更」の混合状態。
- 今回の症状も、その混合状態で顕在化している可能性が高い。

## 設計上の失敗点
### 1. 2026-01-13 の理想構造を最後まで貫けていない
- 設計書は良い。
- 問題は、実装で `Decoration.widget` と NodeView shell が混ざったこと。

### 2. 根本修正より症状修正が優先され続けた
- 2026-01-19 以降は、ズレのたびに margin / padding / offset の修正が入っている。
- これは短期的には正しいが、長期的には問題を深くした。

### 3. host/content の責務が曖昧
- host がレイアウトの責務を持つのか
- content が本文列の責務を持つのか
- widget が列外 UI なのか本文内 UI なのか
- これが文書と実装でずれたまま残っている。

## 現在の判断
- この問題は「left 値をいじれば終わる」問題ではない。
- 長期履歴を見ると、何度も似たズレを個別修正しており、再発のたびに別ノード種別へ波及している。
- したがって、次に直すときは **handle を本文レイヤーの外へ完全に出す** か、**block-content 側に本当の左列を持たせる** かのどちらかに統一すべき。

## 次に実装すべきこと
1. `handle` がどの DOM に属すべきかを一意に決める
2. `host` / `content` / `widget` の責務を再定義する
3. list/blockquote/code/table への個別オフセットを減らす
4. 「重なりが再発しない構造」へ寄せてから細部調整する

## 参照
- [2026-03-22-handle-overlap-debug.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-03-22-handle-overlap-debug.md)
- [2026-01-13-block-handle-wrapper-design.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-01-13-block-handle-wrapper-design.md)
- [2026-01-14-block-wrapper-implementation.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-01-14-block-wrapper-implementation.md)
- [2026-02-04-handle-active-changeguard-vsix.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-02-04-handle-active-changeguard-vsix.md)
- [2026-02-07-preview-handle-frontmatter-alignment-fix.md](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-02-07-preview-handle-frontmatter-alignment-fix.md)
