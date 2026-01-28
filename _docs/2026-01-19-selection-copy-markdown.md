# 2026-01-19 選択範囲コピーを Markdown 化

## 目的
- テキスト範囲選択でのコピー時に Markdown を出力する。
- 失敗時は即エラーで可視化し、フォールバックは行わない。

## 実装方針
- `editorProps.clipboardTextSerializer` で `text/plain` を Markdown に置換。
- `Slice` の内容を JSON 化し、
  - ブロックを含む場合は `{ type: 'doc', content }` として Markdown 直列化
  - インラインのみなら `content[]` を直接 Markdown 直列化
- 失敗時は ERROR ログを出し空文字を返す。
  - **フォールバック無しは仕様**（失敗は即エラーで顕在化）。
  - これは本プロジェクトの「フォールバックで延命しない」原則に従う。

## 変更点
- `packages/webview/src/editor/createEditor.ts`
  - `serializeSelectionMarkdown()` を追加
  - `clipboardTextSerializer` を設定
  - INFO/SUCCESS/ERROR ログを追加

## 追加ログ
- `[INFO][Clipboard]` / `[SUCCESS][Clipboard]` / `[ERROR][Clipboard]`
  - selection 範囲 / openStart/openEnd / hasBlock / 直列化長 / 所要時間

## o3MCP
- o3MCP = 外部リサーチ支援用の検索・要約エージェント。
- 本件では「Markdown クリップボード直列化の一般的な知見」を確認したかったが、タイムアウトで結果取得できず。
- **機能実装には影響なし**（仕様/挙動は既に決定済み）。
- 必要になれば別角度の質問に切り替えて再調査する。
