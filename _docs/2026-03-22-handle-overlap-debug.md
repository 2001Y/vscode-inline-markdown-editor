# 2026-03-22 ハンドルが文字にかぶる件の調査

## 目的
- ブロックハンドルが本文テキストと重なる原因を特定する。
- Playwright Interactive / VS Code デバッグのどちらを主軸にすべきかも整理する。

## 調査方法
- ソースコードの配置と CSS を突き合わせて、ハンドルの描画レイヤーと本文の余白レイヤーを確認した。
- 追加で、`coding-confidant` を使って Playwright Interactive と VS Code 拡張デバッグの公開情報も確認した。
- この環境では main webview の単独 preview 入口が見当たらなかったため、実機再現はせず、DOM 構造ベースで原因を絞り込んだ。

## 結論
ハンドルは「本文を押しのける余白」ではなく「本文の上に重なる絶対配置」で描画されている。  
そのため、`block-handle-host` に付けた padding では本文とハンドルの重なりが解消しない。

## 原因候補
### 1. ハンドル widget が `contentDOM` の中に入っている
- `Decoration.widget(...)` は `pos + 1` に置かれており、本文ノードの `contentDOM` 側に挿入される。
- つまり、ハンドルは本文と同じ内容ボックス基準で位置決めされる。
- 該当箇所: [inlineDragHandleExtension.ts](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/editor/inlineDragHandleExtension.ts#L356)

### 2. ハンドルの位置指定が `left: 0`
- `.block-handle-container` は `position: absolute; left: 0; top: 50%; transform: translateY(-50%);`。
- 余白がなければ、ハンドルは本文の先頭文字と同じ起点に乗る。
- 該当箇所: [styles.css](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/styles.css#L1277)

### 3. 余白を付けているのが `block-handle-host` だけ
- `block-handle-host` に padding があるが、本文も同じコンテナ内なので、ハンドルだけを外に逃がせていない。
- 該当箇所: [styles.css](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/styles.css#L473)

### 4. `block-content` 側に専用の左ガターがない
- `.block-content` は `position: relative; width: 100%` で、ハンドルの逃げ場になる左右余白を持たない。
- Paragraph / Heading は `block-content` がインラインブロック化されていても、起点は本文と同じ。
- 該当箇所: [styles.css](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/styles.css#L1304)

### 5. コードブロック系はシェル padding の内側に重なる
- `pre.code-block` / `pre.raw-block-content` に padding はあるが、その内側でハンドルも本文も同じ起点を共有する。
- そのため、コードブロックでも見た目上は重なりやすい。
- 該当箇所: [styles.css](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/styles.css#L230) と [styles.css](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/styles.css#L269)

### 6. z-index で前面に出ている
- ハンドルは `z-index: 2` で本文より前に描かれる。
- 余白が足りない状態だと「本文を避ける」のではなく「本文の上に被さる」見え方になる。
- 該当箇所: [styles.css](/Users/2001y/_dev/vscode-inline-markdown-editor/packages/webview/src/styles.css#L1277)

## 補足
- `block-handle-host` の padding を増やすだけでは不十分。
- 本質的には、ハンドル専用の左ガターを `block-content` 側に持たせるか、ハンドルを本文とは別のレイヤーに出す必要がある。
- 以前の設計メモでも「Decoration に依存し続けるなら widget のみ 1 件化しても、余白 CSS が必要」と書かれている。
- 参考: [2026-02-04 ハンドル1件表示の復旧 / 不明ブロック表示](/Users/2001y/_dev/vscode-inline-markdown-editor/_docs/2026-02-04-handle-unknownblock-fix.md)

## デバッグ手段の評価
- Playwright Interactive は、この手の DOM/CSS/座標系の重なり確認には向いている。
- ただし VS Code 拡張ホストや webview 固有の挙動は、VS Code の DevTools と `--inspect-extensions` を併用する方が確実。
- このリポジトリでは、まず `code --extensionDevelopmentPath` + DevTools で実機を見て、レイアウトだけを Playwright で切り分けるのが最短。

## 次の実装候補
- `.block-content` 側に左ガターを持たせる。
- もしくは `block-handle-container` を `block-content` の外に出して、本文と完全に別レイヤーにする。
- どちらかに統一しない限り、重なりは再発しやすい。
