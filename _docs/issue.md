# 追加検討/改善メモ

- block-context-menu / table-context-menu のキーボードナビゲーション（↑↓/Enter/Escape）が未実装。設計書 5.2 に合わせて対応する余地あり。
- editor/title のアイコンはオーバーフロー仕様のため常時固定表示ができない。context menu / command palette など複線導線を明確化する余地あり。
- ブロックハンドルはリスト以外で無効になる問題があるため、公式 DragHandle 拡張への移行を含めたシンプル化の検討余地あり。
