# 2026-02-03 設定変更の動的反映

## 参照（一次情報）
- VS Code Webview は `localResourceRoots` でローカルリソースの許可範囲を制御する。
- Webview の HTML は `webview.html` を再設定することで再読み込みできる。
- Webview と拡張機能の通信は `postMessage` / `onDidReceiveMessage` が公式の手段。

## 方針（変更の分類）
- **Hot Apply（即時反映）**
  - `inlineMark.sync.*`
  - `inlineMark.view.*`
  - `inlineMark.debug.enabled`
  - `inlineMark.security.allowWorkspaceImages`
  - `editor.wordWrap`（`view.noWrap` の解決に影響）
- **Webview Reload 必須（CSP 変更）**
  - `inlineMark.security.allowRemoteImages`
  - `inlineMark.security.allowInsecureRemoteImages`
- **Window Reload 必須（登録時オプション）**
  - `inlineMark.webview.retainContextWhenHidden`

## 実装要点
- Extension 側
  - `onDidChangeConfiguration` で対象変更を検知。
  - Hot Apply は `configChanged` を全 Webview へ送信。
  - `allowWorkspaceImages` 変更時は `localResourceRoots` を更新。
  - CSP 変更時は `webview.html` を再設定して Webview を再初期化。
  - `retainContextWhenHidden` は警告＋Window Reload の導線。
- Webview 側
  - `configChanged` を受信して `applyViewConfig` を再実行。
  - `allowWorkspaceImages=false` で画像解決キャッシュを破棄し、元の `src` へ戻す。
  - `allowWorkspaceImages=true` で再解決を実行。

## 既存の動的設定（理由あり）
- `inlineMark.security.confirmExternalLinks`
  - リンク操作時に毎回参照し、ユーザーの最新設定に従う（安全性とUXのため）。
- `inlineMark.sync.changeGuard.*`
  - 編集量のしきい値は編集処理のたびに参照し、即時反映する設計。

