# 2026-02-03 VS Code テスト実行修正

## 目的
- `npm run test` が失敗する原因を除去して、テスト→VSIX の流れを成立させる。

## 事象
1. `ELECTRON_RUN_AS_NODE=1` が環境に存在すると、Electron が Node モードで起動し、
   VS Code テスト用 CLI 引数（`--no-sandbox` 等）を拒否して終了。
2. `extensionTestsPath` がテストランナーとして認識されず、
   `Path file:///.../out/test/index does not point to a valid extension test runner.` が発生。
3. `Extension should be present` が失敗（拡張IDの不一致）。
4. IPC パス長警告（user-data-dir が長すぎる）。

## 対応
- `packages/extension/src/test/runTest.ts`
  - `ELECTRON_RUN_AS_NODE` を検知し、テスト実行前に削除（リセット）。
  - WARNING ログを出力。
  - 実行後に元の環境値を復元。
  - `--user-data-dir` と `--extensions-dir` を `/tmp` 配下の短いパスに指定。
  - INFO/SUCCESS ログに timestamp と所要時間を記録。
- `package.json`
  - `npm run test` 実行時に `env -u ELECTRON_RUN_AS_NODE` を付与して恒久的に除外。
- `packages/extension/src/test/index.ts`
  - VS Code の期待する `run` 関数を export するよう修正。
- `packages/extension/src/test/extension.test.ts`
  - 拡張IDを `2001y.inlinemark` に修正。

## 参考（o3MCP 要点）
- `ELECTRON_RUN_AS_NODE` が残ると Electron が Node モードになり、VS Code 起動が壊れる。
- テストランナー内で削除するのは実務的に妥当。

## 実行メモ
- 修正後に `npm run test` → `npm run package` を再実行する。
