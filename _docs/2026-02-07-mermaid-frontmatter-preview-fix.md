# Mermaid プレビュー表示不安定 / Frontmatter 背景差異 修正メモ

## 事象
- Mermaid は `Rendered` ログが出るが、表示崩れまたは非表示になるケースがある。
- Frontmatter の背景が code block と一致しない見え方がある。

## 原因
- Mermaid の SVG を iframe DOM に直接挿入しており、CSP 下で inline style が拒否されやすい。
- code/frontmatter シェルのスタイル定義が重複し、適用順の影響で見た目が揺らぐ。

## 対応
- Mermaid プレビューを SVG 文字列の直接 DOM 挿入から `data:image/svg+xml` の `img` 表示へ変更。
  - CSP 影響を受けやすい inline style 適用経路を回避。
  - レンダリング後 `resize` を発火して高さ同期を安定化。
- Mermaid テーマは VSCode 変数由来の `themeVariables` のみで指定し、追加の強制色 CSS を削除。
- code/frontmatter のシェル定義を共通化し、背景/角丸/余白を同一に統一。
- table は `border-collapse: separate` ベースの定義へ整理し、角丸との相性を改善。
- プレビュー表示中の source 変更時に再描画する仕組みを追加。

## 変更ファイル
- `packages/webview/src/preview/mermaidPreview.ts`
- `packages/webview/src/editor/blockPreview.ts`
- `packages/webview/src/editor/disableKeyboardShortcuts.ts`
- `packages/webview/src/editor/rawBlockExtension.ts`
- `packages/webview/src/styles.css`

## 検証
- `npm run build` 成功
- `npm run test` 成功
- `npm run package` 成功
