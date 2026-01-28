# 2026-01-15 パッケージング時 Secretlint 失敗の根本対応

## 事象
- `npm run package` が secretlint 実行中に失敗。
- 具体的には `os.cpus().length === 0` の環境で p-map の concurrency が 0 になり例外発生。

## 原因
- `@secretlint/node` が `concurrency: os.cpus().length` をそのまま使用。
- VS Code webview/CI/特定サンドボックス環境で `os.cpus()` が空配列になる。

## 対応
- `NODE_OPTIONS=--require ./scripts/patch-os-cpus.cjs` を挟み、
  `os.cpus()` が空配列の場合に **最低1CPUを返す**パッチを当てる。
- これにより secretlint の concurrency が 0 にならず、スキャンが正常に走る。

## 変更点
- `scripts/patch-os-cpus.cjs` 追加
- `package.json` の `package` スクリプトを修正
  - `NODE_OPTIONS=--require ./scripts/patch-os-cpus.cjs` で vsce 実行

## 補足
- グローバル vsce / secretlint を直接改変せず、
  プロジェクト内パッチで安全に回避。
