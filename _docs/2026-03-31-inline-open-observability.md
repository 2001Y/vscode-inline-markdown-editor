# 2026-03-31 inline markdown editor open path observability

> Historical record: the sections below describe the March 31 implementation, not the final October recovery.

## 2026-10-08 selective recovery

- Recovered the runtime tracing work while excluding the separate Kanban autostart analysis and the custom success-marker test runner. The existing official extension-test runner remains unchanged.
- All explicit opens use a shared scoped queue wrapper. Successful reveals of existing panels and failures both clear pending traces; resolves match editor column and discard expired entries.
- Expected untraced default/Explorer/restored opens and unimplemented navigation diagnostics are DEBUG, not routine warnings. INFO/DEBUG/TRACE diagnostics and viewport work are debug-gated.
- Delayed viewport probes are cancelled across init generations/sessions. Diagnostic payloads and host logs retain session correlation. Visibility describes both selection endpoints, not every rectangle in a multi-line range.
- Export masking recursively covers nested URI/path fields and arrays, strips URI query/fragment data, and respects workspace directory boundaries.
- Capture context is replayed once the document JSONL sink exists. Opens that never resolve have Output-channel diagnostics only; this does not promise an exported JSONL record for every failed/cancelled open.
- Selection/reveal parity and Git dirty-diff decorations are still not implemented.
- Focused regression tests cover queue cleanup, view-column/expiry matching, URI masking, debug gating and stale-frame cancellation. Full UI/IME/extension-host verification remains a release gate.

## 目的

- `_docs/2026-03-31-vscode-standard-editor-gap-audit.md` の結論を正として、`diff` を含む `inlineMark` 起動経路の入力状態と表示結果を JSON 構造ログで追跡できるようにする。
- selection / reveal parity 自体は未実装のままにし、その未適用を `WARNING` で顕在化する。
- 後続タスクがログだけで「何が入力され、どこまで適用され、何が未実装か」を再現判断できる状態にする。

## 正とするデータ

- extension host が生成する `InlineEditorOpenTrace` を open path の正本にした。
- `InlineEditorOpenTrace` には下記を持たせる。
  - `seq`
  - `reason`
  - `sourceCommand`
  - `requestedViewType`
  - `targetUri`
  - `targetRange`
  - `targetSelection`
  - `targetVisibleRanges`
  - `activeTextEditor`
  - `activeTab`
  - `createdAt`
  - `createdAtMs`
  - `viewColumn`
- `reopenWithInlineMark` は `TabInputTextDiff.modified` を target 候補として扱う。

## 実装

### extension host

- `packages/extension/src/util/inlineEditorOpenTrace.ts`
  - `TabInputText` / `TabInputTextDiff` / `TabInputCustom` と `activeTextEditor` から `InlineEditorOpenTrace` を生成する helper を追加。
- `packages/extension/src/extension.ts`
  - `inlineMark.reopenWithInlineMark` 実行時に `inlineEditor.open.requestCaptured` を出す。
  - `targetSelection` が取れない場合は `inlineEditor.open.targetSelectionUnavailable` を `WARNING` で出す。
  - `vscode.openWith` 前後で `inlineEditor.open.commandIssued` / `inlineEditor.open.commandCompleted` / `inlineEditor.open.commandFailed` を出す。
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - pending trace queue を追加し、resolve 対象 panel に `openTrace` を紐付ける。
  - `inlineEditor.open.resolve`, `inlineEditor.open.readyReceived`, `inlineEditor.open.initSent`, `inlineEditor.open.initAckReceived`, `inlineEditor.panel.viewStateChanged` を追加。
  - pending trace が resolve まで届かなかった場合は `inlineEditor.open.traceMissingAtResolve` を `WARNING` で出す。

### protocol / webview

- `packages/extension/src/protocol/messages.ts`
- `packages/webview/src/protocol/types.ts`
  - `InitMessage.openTrace` を追加。
- `packages/webview/src/observability.ts`
  - webview 側の open path 専用 reporter を追加し、host JSONL へ戻せるようにした。
- `packages/webview/src/main.ts`
  - `inlineEditor.open.initReceived`
  - `inlineEditor.display.editorCreated`
  - `inlineEditor.open.scrollRestoreDecision`
  - `inlineEditor.open.navigationTargetUnapplied`
  - `inlineEditor.display.contentVisible`
  - `inlineEditor.viewport.initial`
  - `inlineEditor.viewport.afterEditorCreate`
  - `inlineEditor.viewport.afterScrollRestore`
  - を追加。
  - viewport は `scrollTop`, `scrollLeft`, container rect, `posAtCoords` による visible pos range, selection coords で記録する。
- `packages/webview/src/editor/currentLineHighlightExtension.ts`
  - `inlineEditor.decoration.currentLine` を init/apply の両方で記録する。
  - `applied`, `from`, `to`, `reason`, `selectionFrom`, `selectionTo` を持たせた。

## 未実装を明示した点

- `targetSelection` が存在しても、selection / reveal parity はまだ適用しない。
- そのため webview init 時に `inlineEditor.open.navigationTargetUnapplied` を `WARNING` で出す。
- `savedState.scrollTop` を復元した上で navigation target が存在する場合は `inlineEditor.open.scrollRestoreDecision` を `WARNING` に上げる。

## テスト

- `npm run lint`
  - 成功
- `npm run build`
  - 成功
- `npm run test`
  - 4 tests 成功
  - 追加で test runner を修正し、worktree 外の symlink 実体を読まないようにした。
  - `run() completed.` を success marker として parent runner が child VS Code process を確実に閉じるようにした。

## 補足

- 今回は observability のみで、selection / reveal / diff decoration の機能追加はしていない。
- 後続で parity 実装を始めるときは、まずこのログを見て `targetSelection` が host で取れているか、webview init まで届いているか、viewport がどこを向いているかを確認する。
