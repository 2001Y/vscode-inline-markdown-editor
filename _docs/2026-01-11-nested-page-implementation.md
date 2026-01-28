# 2026-01-11 ネストページ実装計画（Notion風）

## 目的
- Notion風の「ネストページ」ブロックを Tiptap で実装する。
- 作成時は **空の Markdown ファイル** を生成し、ブロックとして挿入する。
- 失敗は即エラー（フォールバック禁止）・完全ログ主義で運用。

---

## 公式一次情報（Context7）
- Tiptap 公式ドキュメントに **カスタム Markdown tokenizer / parse / render** の手順と例がある。
- `createAtomBlockMarkdownSpec`（Pandoc風 `:::` 構文）で **atom block** を最短で往復可能。
  - 参照: `@tiptap/core` Markdown utilities / Custom tokenizer。

---

## Markdown 表現（決定）
- canonical: `:::nested-page {path="..." title="..."} :::`
- 理由:
  - Tiptap 公式の atom block spec を使えるため最小実装。
  - HTMLブロックや独自パーサより破綻が少ない。
- `path` は必須、`title` は表示用。
- `path` 制約（セキュリティ）:
  - 相対パスのみ許可（`..` を含むトラバーサルや絶対パスは拒否）。
  - 最大長 255 文字、許可文字は `a-zA-Z0-9-_.\/` のみ。
  - 不正 `path` は **エラーとして扱い、ノードはエラーステート表示**。
- `renderMarkdown` で **常に canonical 形式に正規化**。

---

## Webview ↔ Extension プロトコル（最小）

### Webview → Extension
- `createNestedPage`:
  - `{ requestId, title }`
  - **現状は currentFilePath を送らない**（Extension 側で現在の TextDocument を文脈として使用）
  - 将来的に `{ currentFilePath }` を **任意オプションとして追加**し、明示的に文脈を固定できるようにする
- `openNestedPage`:
  - `{ path }`

### Extension → Webview
- `nestedPageCreated`:
  - `{ requestId, title, path }`
- `nestedPageCreateFailed`:
  - `{ requestId, message, code, details }`

※ 失敗は **必ず `nestedPageCreateFailed` を返信**。
※ Error code 定義:
  - `NESTED_PAGE_UNSUPPORTED_SCHEME`（file以外）
  - `NESTED_PAGE_INVALID_DOCUMENT`
  - `NESTED_PAGE_FOLDER_INVALID`
  - `NESTED_PAGE_FOLDER_CREATE_FAILED`
  - `NESTED_PAGE_DOC_SAVE_FAILED`
  - `NESTED_PAGE_DOC_MOVE_TARGET_EXISTS`
  - `NESTED_PAGE_DOC_MOVE_TARGET_STAT_FAILED`
  - `NESTED_PAGE_DOC_MOVE_FAILED`
  - `NESTED_PAGE_CHILDREN_FOLDER_INVALID`
  - `NESTED_PAGE_CHILDREN_FOLDER_CREATE_FAILED`
  - `NESTED_PAGE_FILE_EXISTS`
  - `NESTED_PAGE_FILE_STAT_FAILED`
  - `NESTED_PAGE_FILE_CREATE_FAILED`
  - `NESTED_PAGE_OPEN_FAILED`
  - `NESTED_PAGE_CREATE_UNEXPECTED`

※ 同時リクエストの扱い:
  - 現状は **独立処理**（明示的なキューや排他はなし）。
  - 将来的に `currentFilePath` を追加した場合、同一 `currentFilePath` への同時作成は `NESTED_PAGE_REQUEST_IN_FLIGHT` を返す方針。

---

## ファイル生成ロジック（決定）
1. 現在の TextDocument (`document.uri`) の親フォルダを取得。
2. **親フォルダ配下に「現在の md ファイル名（拡張子除外）」のフォルダを作成**。
3. **自動ファイル名**（`page-YYYYMMDD-HHmmss-SSS.md`）で生成。
4. 既存ファイルがある場合は **即エラー**（自動の別名生成はしない）。
5. `temp -> rename(overwrite:false)` で作成し、競合や上書きを防止。

---

## Node / UI 仕様（決定）
- `nestedPage` は `atom: true`, `draggable: true`, `selectable: true`。
- attrs: `path (required)`, `title (optional)`, `indent`。
- NodeView: アイコン + タイトル + パスを表示、クリックで `openNestedPage` を送信。
- `path` 不在時は **error 表示 + エラーログ**。

---

## 失敗時の扱い
- Webview: `nestedPageCreateFailed` 受信 → `notifyHostError` で即通知。
- Extension: `logger.error` で必ず詳細を記録。
- 代替作成や自動フォールバックは行わない。

---

## 動作確認ポイント
- block-menu から nested page を作成できる。
- 期待通りのフォルダ/ファイルが生成される。
- 既存ファイルがある場合はエラー通知される。
- ブロッククリックで新規ファイルが InlineMark で開く。
