# 2026-02-06 プレビュー時 contentMatchAt エラー対応

## 事象
- HTML/mermaid のプレビュー切替で `WEBVIEW_RUNTIME_ERROR: Called contentMatchAt on a node with invalid content` が発生。
- Mermaid プレビューの iframe 内で `script-src` がブロックされる（`asWebviewUri` の origin が許可されていない）。

## 原因
- NodeView の DOMObserver が、プレビュー用 iframe/コンテナの DOM 変更や `contentDOM` の表示切替を
  変更として解釈し、ProseMirror が不正な DOM をパースしようとして例外を起こしていた。
- iframe の CSP が `vscode-webview://...` のみ許可で、`https://file+.vscode-resource.vscode-cdn.net/...` を許可していなかった。

## 対応
- `rawBlock` / `codeBlock` NodeView に `ignoreMutation` を追加。
  - `contentDOM` 外の DOM 変更は無視。
  - `contentDOM` の属性変更（表示切替）も無視。
- Mermaid iframe の CSP を修正。
  - 不正 source (`https://file+.vscode-resource.vscode-cdn.net`) を削除。
  - `script-src` / `style-src` は `https://*.vscode-cdn.net` を許可し、nonce も付与。
- プレビュー切替で `element.style.display` を使わず、CSS class 切替へ変更（親 Webview CSP の inline style 違反を回避）。
- iframe 内から `https://file+.vscode-resource.vscode-cdn.net` を直接参照しないよう変更。
  - 親 Webview 側で CSS/JS を取得し、iframe `srcdoc` に inline 埋め込み。
  - `ERR_NAME_NOT_RESOLVED` が出る環境でもプレビュー可能にした。
- Mermaid preview runtime から JS による inline style 代入を削除し、CSS class ベースに変更。
- `rawBlock(kind=html)` のラベルを「直書きHTML」に変更。
- iframe 高さをコンテンツ連動（ResizeObserver + postMessage）へ変更。
  - `min-height` は維持しつつ、`details/summary` 展開などで追従する。

## 検証
- 未実施（必要なら `npm run test` / `npm run package`）。
