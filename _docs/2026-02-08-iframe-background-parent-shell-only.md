# 2026-02-08 iframe 背景を親 block shell のみに統一

## 依頼
- 直書き HTML / Mermaid の iframe プレビューで、背景色は親ブロックだけで管理したい。
- iframe 側の背景指定は削除し、抜け漏れなく洗い出して修正したい。

## 方針
- 親 `.block-content` の `--block-shell-bg` のみを背景レイヤーとして使う。
- iframe (`srcdoc`) の `html/body` は透明に統一する。
- 例外経路（プレビューエラー文書）も同じ方針に揃える。

## 削除箇所の洗い出し（実施）
- `packages/webview/src/editor/blockPreview.ts`
  - `buildHtmlPreviewDocument`
    - `:root` の `--block-shell-bg` 定義を削除。
    - `body { background: var(--block-shell-bg); }` を削除。
  - `buildMermaidPreviewDocument`
    - `:root` の `--block-shell-bg` 定義を削除。
    - `body { background: var(--block-shell-bg); }` を削除。
  - `buildPreviewErrorDocument`（見落としやすい例外経路）
    - `body { background: ${options.background}; }` を削除。
  - `PreviewDocOptions`
    - 背景プロパティ `background` を削除（未使用化のため）。
  - `enterPreview` の `previewOptions`
    - `background` の受け渡しを削除。

## 変更後の期待動作
- iframe 内背景は透明で、親 block shell 背景のみが見える。
- `--vscode-textCodeBlock-background` が `rgba(...)` でも、iframe 側で二重に背景を重ねない。
- HTML / Mermaid / エラー表示の全経路で背景レイヤーの扱いが一致する。

## 追加で判明した原因と対策
- Webview 実測ログで、iframe 内 `body` に `workbench.desktop.main.css` の
  `body { background: ... !important }` が効いていた。
- 原因は HTML preview の継承 CSS 収集で、ホスト側スタイルまで iframe に流し込んでいたこと。
- 対策:
  - iframe への継承 CSS 注入は維持しつつ、CSSOM でサニタイズして注入する。
  - 対象外は `html` / `body` / `:root` で始まるセレクタのみ（グローバル干渉の抑止）。
  - それ以外のルールは継承し、フォントやコンテンツ系スタイルの統一感を保つ。
  - `!important` は追加しない。

## 2026-02-08 追補（除外漏れ対策の強化）
- 追加原因:
  - root 要素除外の判定を `Element.matches()` 依存にしていたため、複合セレクタや条件付きセレクタで漏れうる。
  - `@scope` など grouping rule の prelude に root 指定があるケースを除外できていない可能性がある。
- 追加対策（`packages/webview/src/editor/blockPreview.ts`）:
  - `selectorTargetsRootElement` を導入し、セレクタ文字列をトークン解析して `html` / `body` / `:root` を検出して除外。
  - `@import` ルールは継承対象から明示除外（再流入防止）。
  - grouping rule は prelude まで検査し、root に紐づくものは丸ごと除外。
  - `cssRules` を辿れない未知ルールについても、`rule.cssText` から root セレクタを検出して除外。
  - 直接 `blob:` fetch が CSP で不可なため、iframe 側から `postMessage` で背景診断値を返す計測フックを追加。
  - サニタイズ統計ログ（除外セレクタ数、除外ルール数、`@import` 除外数、処理時間）を追加。
  - 最終生成 CSS に root セレクタが残っていないか漏れ検知ログを追加。
- 追加対策（親側背景の不透明化）:
  - `packages/webview/src/main.ts` に `applyOpaqueBlockShellBackground` を追加。
  - `--vscode-textCodeBlock-background`（半透明可）を `--vscode-editor-background` 上で 1x1 Canvas 合成し、`rgb(...)` の不透明色へ正規化。
  - 結果を `--inline-mark-opaque-block-shell-bg` として `document.documentElement` に設定。
  - `handleInit` / `handleConfigChanged` の両方で再計算。
  - テーマ属性変化（`class` / `style` / `data-vscode-theme-*`）を `MutationObserver` で監視し、再計算。
  - `packages/webview/src/styles.css` の `--block-shell-bg` は
    `var(--inline-mark-opaque-block-shell-bg, var(--vscode-textCodeBlock-background))` を参照。
  - `packages/webview/src/editor/blockPreview.ts` の `mutedBackground` も
    `--inline-mark-opaque-block-shell-bg` を優先利用。
- ビルド確認:
  - `npm run -w packages/webview lint` 成功
  - `npm run -w packages/webview build` 成功
  - `npm run package` 成功（`packages/extension/inlinemark-0.1.3.vsix`）
