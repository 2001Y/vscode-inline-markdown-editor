# 2026-03-31 通常 VS Code エディタ基準との差分監査

## 目的

- 通常の VS Code テキストエディタ挙動を正とし、inline markdown editor の現状実装との差分を、入力・イベント・内部状態・表示結果で棚卸しする。
- `git diff` / dirty diff / diff editor / search result / definition jump などの遷移で、何がハイライト表示と自動スクロールを成立させているかを特定する。
- その結論に基づき、後続実装タスクの方向性を固定する。

## 先に結論

1. 通常 VS Code エディタで selection highlight / current line highlight / auto reveal が成立する主因は、`openEditor` / `showTextDocument` 系が `selection` と `selectionRevealType` を editor へ渡し、editor 本体が `setSelection(..., 'code.navigation')` と `revealRange...()` を実行することにある。
2. dirty diff は上記とは別系統で、`QuickDiffProvider -> original resource -> QuickDiffDecorator` により visible `ICodeEditor` へガター/overview/minimap 装飾が付く。custom editor webview には自動継承されない。
3. inlineMark 現状は `TextDocument` の content/version/config しか webview に渡しておらず、selection / reveal / diff metadata の経路が存在しない。よって、通常エディタで成立している「外部ナビゲーション由来のハイライトと自動スクロール」は再現されない。
4. 後続実装は 2 本に分離する。
   - Phase 1: host-originated `NavigationTarget` 1 本を正とする selection/reveal parity
   - Phase 2: quick diff / dirty diff を別責務の差分装飾パイプラインとして実装

## 調査対象

### ローカル実装

- `packages/extension/src/extension.ts`
- `packages/extension/src/editors/inlineMarkProvider.ts`
- `packages/extension/src/protocol/messages.ts`
- `packages/webview/src/main.ts`
- `packages/webview/src/editor/createEditor.ts`
- `packages/webview/src/editor/currentLineHighlightExtension.ts`
- `packages/webview/src/editor/findWidget.ts`
- `packages/webview/src/protocol/client.ts`
- `packages/webview/src/protocol/types.ts`
- `_docs/2026-02-02-diff-mode-research.md`
- `_docs/2026-02-02-git-diff-highlight.md`
- `_docs/2026-02-03-current-line-highlight.md`
- `_docs/2026-02-03-find-scroll-fix.md`

### 一次情報

- Custom Editor API
  - https://code.visualstudio.com/api/extension-guides/custom-editors
- VS Code API
  - https://code.visualstudio.com/api/references/vscode-api#TextDocumentShowOptions
  - https://code.visualstudio.com/api/references/vscode-api#TextEditor
  - https://code.visualstudio.com/api/references/vscode-api#TabInputTextDiff
- Theme Color
  - https://code.visualstudio.com/api/references/theme-color
- SCM / Quick Diff
  - https://code.visualstudio.com/api/extension-guides/scm-provider

### VS Code source

- commit: `eeaba7db527cc4587291982c46e21f82b3025ed9`
- `src/vs/workbench/api/common/extHostTypeConverters.ts`
- `src/vs/workbench/common/editor/editorOptions.ts`
- `src/vs/platform/editor/common/editor.ts`
- `src/vs/workbench/browser/parts/editor/textResourceEditor.ts`
- `src/vs/workbench/browser/parts/editor/textDiffEditor.ts`
- `src/vs/workbench/browser/parts/editor/textEditor.ts`
- `src/vs/editor/browser/widget/codeEditor/codeEditorWidget.ts`
- `src/vs/workbench/contrib/scm/common/quickDiff.ts`
- `src/vs/workbench/contrib/scm/common/quickDiffService.ts`
- `src/vs/workbench/contrib/scm/browser/quickDiffDecorator.ts`
- `src/vs/workbench/contrib/scm/browser/quickDiffWidget.ts`

## 正: 通常 VS Code エディタで何が起きているか

### 1. 単一テキストエディタへのナビゲーション

- `TextDocumentShowOptions.selection` は ext host で `ITextEditorOptions.selection` に変換される。
- `applyTextEditorOptions()` は explicit `selection` がある場合、view state の `cursorState` を空にして explicit selection を優先する。
- 同関数は `editor.setSelection(range, selectionSource ?? 'code.navigation')` を呼び、続けて `selectionRevealType` に応じて `revealRangeInCenter` / `revealRangeInCenterIfOutsideViewport` / `revealRangeNearTop` を呼ぶ。
- `CodeEditorWidget` はこれにより selection state を更新し、`onDidChangeCursorSelection` を発火する。

### 2. current line highlight

- 通常エディタの現在行ハイライトは editor 本体の責務で、`editor.renderLineHighlight` と `editor.lineHighlightBackground` / `editor.lineHighlightBorder` に従う。
- これは extension 側メッセージではなく editor selection/cursor state から描画される。

### 3. dirty diff / quick diff

- quick diff は `QuickDiffProvider.getOriginalResource(uri)` が original を返し、VS Code が original と modified を比較して visible `ICodeEditor` に装飾する。
- `QuickDiffWorkbenchController.onEditorsChanged()` は visible text editors に `QuickDiffDecorator` を付与する。
- `QuickDiffDecorator` は gutter / overview ruler / minimap 用の decoration を生成する。
- `QuickDiffWidget` は change reveal 時に `revealLineInCenterIfOutsideViewport()` や diff editor 側の `revealLinesInCenter()` を使う。

### 4. diff editor

- `TextDiffEditor.setInput()` は selection/view state が無ければ `revealFirstDiff()` を呼ぶ。
- selection がある場合は modified side の cursor state を捨てて selection を優先する。

## inlineMark 現状経路

### 1. open / init

- `extension.ts` の `openWithViewType()` は `vscode.openWith(uri, viewType, { viewColumn, preview: false })` だけを渡す。selection は渡していない。
- `InlineMarkProvider.resolveCustomTextEditor()` は `document` と `WebviewPanel` を受け取るだけで、selection / reveal 情報は持たない。
- `InlineMarkProvider.handleReady()` が送る `init` メッセージは `version`, `content`, `sessionId`, `clientId`, `locale`, `i18n`, `config` のみ。
- `protocol/messages.ts` と `protocol/types.ts` に selection / reveal / navigation target / diff metadata の message type は存在しない。

### 2. content sync

- `onDidChangeTextDocument()` は `docChanged(version, reason, changes)` を broadcast する。
- `SyncClient.handleDocChanged()` は `shadowText` と `baseVersion` を更新するが、selection や scroll target は保持しない。
- `createEditor.applyChanges()` は外部変更時に `syncClient.getShadowText()` で全文 `setContent()` し直す。

### 3. 現在行ハイライト

- `CurrentLineHighlight` は webview 内の ProseMirror selection が空のときのみ textblock/block に `is-current-line` decoration を付与する。
- これは通常エディタの editor selection state ではなく、webview 内 selection にのみ反応する。

### 4. find と自動スクロール

- `findWidget.ts` は active match を独自管理し、`ensureMatchVisible()` で container の `scrollTop` を直接調整する。
- `main.ts` の `handleFindCommand()` は `findNext` / `findPrevious` を webview 内 command として処理する。
- これは外部ナビゲーションではなく webview 内検索専用の経路。

### 5. saved scroll

- `main.ts` は init 後に `savedState.scrollTop` を常に復元する。
- 現状は explicit navigation target が無いため問題が顕在化しないが、今後 selection/reveal を入れると競合要因になる。

## 差分表

| 項目 | 通常 VS Code エディタ | inlineMark 現状 | 判定 |
| --- | --- | --- | --- |
| 外部ナビゲーションの selection 受信 | `selection` を open/show options で受ける | 受け口なし | 未再現 |
| 外部ナビゲーション時の auto reveal | editor 本体が `revealRange...()` を実行 | 経路なし | 未再現 |
| current line highlight | editor 本体が cursor/selection state から描画 | webview 内 plugin で独自実装 | 部分再現 |
| webview 内 find の highlight | 標準 Find widget | 独自 `findWidget` と active match decoration | 別実装で再現済み |
| webview 内 find の auto scroll | editor / reveal API | `ensureMatchVisible()` で manual scroll | 再現済み |
| dirty diff gutter/minimap/overview | `QuickDiffDecorator` が visible text editor に decoration | 実装なし | 未再現 |
| diff editor の first diff reveal | `revealFirstDiff()` | 実装なし | 未再現 |
| diff tab (`TabInputTextDiff`) 検知 | API あり | 実装なし | 未再現 |
| selection source (`code.navigation`, `code.jump`) | editor state に保持される | message/protocol に存在しない | 未再現 |

## 再現対象

### Phase 1 で再現する対象

- host 側が 1 つの URI と 1 つの range を持っている単発ナビゲーション
  - Search result
  - Problems
  - Outline / Breadcrumbs
  - Go to definition / references 相当
  - 標準テキストエディタから inlineMark へ reopen するときの現在 selection
- collapsed range の場合
  - target caret line が可視化される
  - current line highlight が target に乗る
- non-collapsed range の場合
  - webview 内 selection が target range に一致する
  - range が viewport 外なら center-if-outside-viewport 相当で reveal される

### Phase 1 で再現しない対象

- side-by-side diff editor の full parity
- `revealFirstDiff()` を含む diff editor 固有挙動
- dirty diff の gutter / minimap / overview ruler
- quick diff peek widget
- multi-selection navigation
- editor.selectionHighlight / occurrencesHighlight の完全互換

## API 制約

1. `CustomTextEditorProvider.resolveCustomTextEditor(document, webviewPanel, token)` には `selection` が渡らない。
2. custom editor の view は `WebviewPanel` であり `ICodeEditor` ではない。よって `QuickDiffDecorator` のような通常 editor decoration は自動では付かない。
3. `onDidChangeTextDocument` から得られるのは content/version 差分であり、ナビゲーション由来の range や reveal reason は推定できない。
4. 現状の `vscode.openWith` 呼び出しは selection を持ち込んでいない。
5. current line highlight は webview selection が正であり、通常 editor の cursor source を参照していない。

## 正とするデータ

この課題で正とするデータは 1 本に固定する。

```ts
type NavigationTarget = {
  seq: number;
  docUri: string;
  selection: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  revealType: 'center' | 'centerIfOutsideViewport' | 'nearTop' | 'nearTopIfOutsideViewport';
  source: 'code.navigation' | 'code.jump' | 'api';
  reason:
    | 'reopenWithInlineMark'
    | 'search'
    | 'problems'
    | 'outline'
    | 'breadcrumbs'
    | 'definition'
    | 'references'
    | 'fragment';
  createdAt: string;
};
```

- この `NavigationTarget` の正本は extension host に置く。
- webview は `NavigationTarget` を受けて 1 回適用する view であり、正本を持たない。
- content sync の正本は既存どおり `TextDocument` / `document.version` のまま維持する。
- `scrollTop` や webview 内 current selection から navigation target を逆算しない。

## 不要な既存ロジック / 延命しないもの

### 1. `savedState.scrollTop` の無条件復元

- `main.ts` の scroll restore は explicit navigation target より弱い状態である。
- Phase 1 では `NavigationTarget` がある init では scroll restore をスキップする。両方を同時に生かさない。

### 2. `sendEditorCommand()` / `editorCommand` を navigation transport に使う案

- 現状この経路は focused custom tab と focused webview を前提にしており、外部ナビゲーションの state transport には向かない。
- selection/reveal を string command へ詰め込んで延命しない。

### 3. `findWidget` の scroll/highlight を host navigation に流用する案

- `findWidget` は search query と active match を正にしている。
- navigation target は query を持たない別責務なので混ぜない。

### 4. `diffEngine` / content sync diff を dirty diff UI に流用する案

- `diffEngine` は content sync 用の Markdown diff であり、Git original resource 基準の dirty diff とは責務が違う。
- dirty diff は別の original source と別の decoration pipeline に切り出す。

## 必要なログ計測点

### extension host

- `navigationTarget.captured`
  - `seq`, `docUri`, `selection`, `revealType`, `source`, `reason`, `activeTabInputKind`, `activeTextEditorUri`
- `customEditor.resolve`
  - `docUri`, `docVersion`, `clientId`, `sessionId`, `hasNavigationTarget`
- `navigationTarget.sent`
  - `seq`, `clientId`, `sessionId`, `delivered`, `docVersion`
- `navigationTarget.dropped`
  - `reason`, `seq`, `docUri`

### protocol

- `navigation.apply.request`
  - `seq`, `sessionId`, `clientId`
- `navigation.apply.result`
  - `seq`, `selectionApplied`, `revealApplied`, `targetPos`, `scrollBefore`, `scrollAfter`

### webview

- `init.scrollRestoreDecision`
  - `hasSavedScroll`, `hasNavigationTarget`, `restored`, `reason`
- `navigationTarget.received`
  - `seq`, `selection`, `revealType`, `reason`
- `navigationTarget.mapped`
  - ProseMirror resolved position/range, fallback の有無
- `navigationTarget.revealed`
  - `scrollTopBefore`, `scrollTopAfter`, `centered`, `outsideViewport`
- `currentLineHighlight.updated`
  - `seq`, `from`, `to`, `source`

### dirty diff Phase 2

- `quickDiff.originalResolved`
  - `provider`, `originalUri`, `durationMs`, `cacheHit`
- `quickDiff.decorationsApplied`
  - `changeCount`, `lineDecorationCount`, `inlineDecorationCount`, `durationMs`

## 受け入れ条件

1. extension host に `NavigationTarget` がある状態で inlineMark を開くと、webview 初期化完了後 1 回だけ target selection が適用される。
2. collapsed range の場合、target line が viewport 外なら center-if-outside-viewport 相当で reveal され、current line highlight が target に出る。
3. non-collapsed range の場合、webview selection が target range と一致し、saved scroll がそれを上書きしない。
4. `NavigationTarget` が無い通常起動では、既存の saved scroll restore がそのまま動く。
5. webview 内 find next/prev の既存 auto scroll は退行しない。
6. dirty diff は Phase 1 の受け入れ条件に含めない。未実装であることを明示したままにする。
7. ログだけで `NavigationTarget captured -> sent -> received -> applied -> revealed` を再生できる。

## 後続実装タスクの方向性

### Phase 1: selection / reveal parity

1. extension host に `NavigationTarget` の capture 層を追加する。
2. `init` と別 message で `NavigationTarget` を webview へ渡す。
3. webview は editor init 後、saved scroll restore より前に `NavigationTarget` を 1 回適用する。
4. current line highlight は既存 plugin を使い、selection 適用結果に追従させる。

### Phase 2: dirty diff / quick diff

1. Quick Diff source を extension 側で解決する。
2. original resource と change set を webview 用 DTO に変換する。
3. webview 側で line / inline decoration を描く。
4. これは `NavigationTarget` と別プロトコル・別ログで扱う。

## 実装タスクに落とすときの禁止事項

- `scrollTop` を正データにしない。
- `docChanged` から navigation を推定しない。
- `findWidget` や `editorCommand` に selection/reveal を押し込まない。
- dirty diff と content sync diff を混ぜない。

## 補足

- `CurrentLineHighlight` と `findWidget` は「webview 内部で起きた selection/search」については既に成立している。
- 問題の本体は「通常 VS Code 側で観測された navigation state が custom editor へ渡っていない」こと。
- よって、後続タスクの最初の目的は UI の微調整ではなく、host-originated state の transport を作ること。
