# 2026-01-15 依存最新化 + 再パッケージ

## 目的
- 全パッケージを最新化し、スキャン有効のまま VSIX を再生成。

## 実施内容
- `npm-check-updates -u` を root / packages/extension / packages/webview で実行。
- `npm install` で lockfile 更新。
- `npm run build` / `npm run package` を実行。

## 更新概要
- root: `typescript ^5.3.3 → ^5.9.3`
- extension: `@types/vscode` / `@types/node` / `typescript-eslint` 系を最新へ
- webview: `vite ^7.3.0 → ^7.3.1` を更新
- engines: `vscode ^1.108.0` に更新

## パッケージ
- `packages/extension/inlinemark-0.1.0.vsix`

## 注意
- `@types/dompurify` は **stub**（`dompurify` 本体が型を同梱）なので不要。依存に入っている場合は削除で問題なし。
  - 参考: `npm view @types/dompurify deprecated` の内容は「dompurify が型を同梱」。
- `npm audit --json` は **脆弱性 0 件**（low も 0 件）。当時の警告は解消済み。
