# 2026-02-07 Preview Follow-up (Click/Edit, Height, Mermaid Center)

## 背景
- 要望:
  - プレビューを常時基準にし、必要時のみ編集へ移行
  - HTML iframe の高さ追従を安定化
  - Mermaid の見た目を中央寄せ方向へ調整
  - Mermaid 関連ログの挙動確認

## 実装
1. `BlockPreviewController` の編集遷移を `iframe click` のみに変更
   - `focus`/`pointerdown` 起因の誤遷移を避けるため `click` ベースへ統一
2. iframe 高さ計測を実コンテンツ基準へ変更
   - `bodyRect.height` を候補から除外
   - `marker` 基準高さを優先し、0 の場合のみ `scrollHeight` をフォールバック
3. preview iframe の最小高を `80px` に変更
   - 内容に追従しつつ、空状態でも最低限見える高さを維持
4. Mermaid SVG の中央寄せ方向の調整
   - SVG の背景透過を強制
   - 既存のコンテナ中央寄せと併用

## 影響ファイル
- `packages/webview/src/editor/blockPreview.ts`
- `packages/webview/src/styles.css`

## Mermaid 余白メモ
- Mermaid 側には `flowchart.nodeSpacing` / `flowchart.rankSpacing` などの間隔設定がある。
- 「図全体の上下余白」を単独で一括制御する専用オプションは限定的で、最終的には `diagramPadding` と iframe 側レイアウト（padding/align）で合わせるのが実務的。

