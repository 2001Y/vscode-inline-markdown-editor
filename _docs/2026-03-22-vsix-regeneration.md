# 2026-03-22 VSIX再生成

## 目的
- 現在のソース状態を反映した最新版 VSIX を再生成する。

## 実行内容
- `npm run package`

## 結果
- 成功
- 生成物: `packages/extension/inlinemark-0.1.3.vsix`

## 確認メモ
- `packages/extension/package.json` の version は既に `0.1.3` だったため、版数更新は不要だった。
- パッケージ処理内で `packages/extension/README.md` は再コピーされたが、差分は発生しなかった。
