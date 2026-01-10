# List DnD / Table handle 修正メモ (2026-01-10)

## 目的
- listItem 同階層 DnD が失敗する問題の改善。
- ドラッグによるインデント変更が意図しない階層変更を起こす問題を抑制。
- テーブル内でブロックハンドル/＋が出ないようにする。

## 変更方針
- listItem の drag slice を親 list でラップせず、listItem 単体の slice を使う。
- インデント調整は drop 位置の listItem を基準に、1ステップだけ変化させる（過大な delta を抑制）。
  - dropX がインデント基準から離れすぎている場合は delta=0 として扱う。
- selection は listItem 直下の textblock 位置へ安全に移動。
- table cell 内では drag handle を表示しない。
- drop 位置の listItem 解決は posAtCoords が外れやすいので、editor content 内へ座標をクランプして再解決する。
- インデント移動の視認性向上のため、drag中にインデントガイド（list-indent-indicator）を表示する。

## 関連ファイル
- packages/webview/src/editor/inlineDragHandleExtension.ts
