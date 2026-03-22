# 2026-02-06 画像解決のフォールバック排除

## 背景
- Webview が相対パス画像を一度 `vscode-webview://.../images/...` として読み込み、`net::ERR_ACCESS_DENIED` が出ていた。
- 失敗時に元の `src` を返すフォールバックがあり、原則「正常系 or エラー」に反する。

## 対応
- `packages/extension/src/editors/inlineMarkProvider.ts`
  - 画像解決失敗時は `IMAGE_RESOLVE_FAILED` を Webview へ送信し、**空 `resolvedSrc`** を返す。
  - `allowWorkspaceImages` 無効 / パス外 / ファイル未存在 / 例外はすべてエラーとして顕在化。
- `packages/extension/src/protocol/messages.ts`
  - `ErrorCode` に `IMAGE_RESOLVE_FAILED` を追加。
- `packages/webview/src/main.ts`
  - 相対 `src` は解決完了まで `src` を外し、アクセス拒否エラーを回避。
  - `resolvedSrc` が空の場合は `src` を外し、再フェッチを抑制。
  - 設定変更で `allowWorkspaceImages` を無効化した場合は即 `resolveImagesInEditor()` を回し、エラーを可視化。

## 期待効果
- 画像解決の失敗がサイレントに隠れず、必ずエラーとして可視化。
- `net::ERR_ACCESS_DENIED` のノイズを抑制。
