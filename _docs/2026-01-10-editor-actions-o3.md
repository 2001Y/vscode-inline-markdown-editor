# VS Code editor actions（monaco-action-bar）常時表示の可否整理 (2026-01-10)

## 目的
- 「テキストエディタで開き直す」アイコンを editor actions（editor/title のツールバー）に常時固定表示したい。
- editor/title/context はコンテキストメニューであり、目的は editor/title（monaco-action-bar）での表示。

## 一次情報ベースの結論（要点）
- editor/title は **editor actions（ツールバー）**、editor/title/context は **タイトルバーのコンテキストメニュー**。
- editor/title のグループは primary/secondary に分かれ、**navigation / 1_run が primary**。それ以外は `...`（More Actions）側に回る。
- ツールバーは **ユーザー側で Hide 可能**。非表示にした項目は `...` に移動し、Reset Menu / View: Reset All Menus で復元可能。
- 拡張側から「常時固定表示」を強制する手段はない（primary への寄与と順序調整ができるだけ）。

## 実務上の最善策
1) editor/title への寄与を維持しつつ **group を navigation@0** に固定
2) editor/title/context にも同コマンドを露出（到達経路の複線化）
3) commandPalette にも出す（when で制御可）
4) ユーザーが Hide している可能性を前提に、Reset Menu の導線を案内

## 参考
- Contribution Points（menus / editor/title / editor/title/context / group sorting / primary/secondary）
- Custom Layout（Tool bars の Hide / Reset Menu / View: Reset All Menus）

