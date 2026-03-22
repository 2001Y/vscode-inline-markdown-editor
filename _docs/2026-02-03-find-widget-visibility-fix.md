# 2026-02-03 Find Widget 可視化の同期修正

## 事象
- Find コマンド実行ログは出るが、検索モーダルが表示されない。

## 原因
- `state.visible` と DOM の `is-visible` クラスが不一致になっても、
  `setVisibility` が早期 return してクラス再適用を行わない。

## 対応
- `packages/webview/src/editor/findWidget.ts`
  - `setVisibility` 内でクラス同期を強制。
  - 不一致時は WARNING ログで可視化。

## 期待効果
- 状態と DOM 表示の不整合が起きても、モーダルが確実に表示される。
