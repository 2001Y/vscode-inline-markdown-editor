# 2026-01-16 assets ロゴ/サムネ反映

## 変更概要
- ルート `assets/` を廃止し、`packages/extension/assets/` に移動。
- Marketplace のアイコンは `icon` フィールドで `assets/logo.png` を使用。
- README はサムネのみ Markdown 画像で表示（インストール手順は削除）。
- `copy-readme` で README の画像パスを `assets/` に書き換えてコピー。
- VS Code 1.105.1 互換のため `engines.vscode` を `^1.105.0` に調整。

## 変更点
- `packages/extension/package.json`
  - `"icon": "assets/logo.png"` を追加。
  - `copy-readme` で README の画像パスを書き換え。
- `README.md`
  - 先頭にサムネのみを Markdown 画像で追加（HTML 不使用）。
- `packages/extension/assets/`
  - `logo.png`, `tmb.png` を配置（ルートから移動）。
