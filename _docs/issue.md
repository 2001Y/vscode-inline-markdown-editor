# 追加検討/改善メモ

- block-context-menu / table-context-menu のキーボードナビゲーション（↑↓/Enter/Escape）が未実装。設計書 5.2 に合わせて対応する余地あり。
- editor/title のアイコンはオーバーフロー仕様のため常時固定表示ができない。context menu / command palette など複線導線を明確化する余地あり。
- DragHandle の elementsFromPoint 移行後、ネスト list のハンドル判定が正しくなるか UI で再検証が必要。
- `ol` の `1. 1. 1.` 表示が indent marker 抑制で解消するか UI で確認が必要。
