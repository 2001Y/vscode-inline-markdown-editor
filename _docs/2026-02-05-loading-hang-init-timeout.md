# 2026-02-05 ローディングが終わらない件（init待ちの無限ループ対策）

## 事象
- inlineMark Webview のローディングスピナーが消えず、編集画面が表示されない。
- 拡張ログでは `ready` 受信と `Init sent` が確認できるが、その後の進展ログがない。
- Webview コンソールに `Found unexpected service worker controller... Waiting for controllerchange.` が出るケースがある。

## 既存実装の問題点
- `packages/webview/src/main.ts` の `waitForInitialContent` は `.inline-markdown-editor-content` の `childNodes.length > 0` を条件にしていた。
- `editorContainerEl` が存在しない場合に **黙ってローディングを解除** しており、失敗が不可視化される。
- 初期化が進まないケースで **無限に rAF ループ** を回し続け、ローディングが終了しない。

## 対応方針
- **失敗は即エラーで顕在化**：初期化が進まない場合は `notifyHost` で ERROR を出す。
- ローディング解除条件を **コンテンツ要素の存在** に変更（空ドキュメントでも成立）。
- **タイムアウトを追加**し、一定時間以内に初期化が進まない場合は明示エラー。

## 実装内容
- `waitForInitialContent` に以下を追加:
  - init シーケンス番号による古い待機の無効化
  - タイムアウト (`INIT_LOADING_TIMEOUT_MS = 15000`) 超過時の ERROR 通知
  - `editorContainerEl` 未検出時の ERROR 通知
  - `.inline-markdown-editor-content` が存在した時点でローディング解除
- `handleInit` で `editorContainerEl` 未検出時に ERROR 通知を追加

## 変更ファイル
- `packages/webview/src/main.ts`

## 期待される効果
- 初期化が詰まっても **無限ローディングにせずエラーとして可視化** できる。
- 空ドキュメントでもローディングが正しく消える。
- ログに開始時刻・経過時間が残り、リプレイ可能性が向上。
