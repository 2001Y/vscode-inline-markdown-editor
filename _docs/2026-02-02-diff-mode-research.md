# VS Code diff モード検知・Git 基準・2層diff・Worker 方針（調査メモ）

## 1. VS Code で diff が開かれたことを検知できるか
- Tabs API で `TabInputTextDiff`（テキスト差分タブ）を検知可能。`original`/`modified` の URI を持つ。  
  - 参照: `TabInputTextDiff`（vscode API）
- Custom editor は `TabInputCustom` で表現される。  
  - 参照: `TabInputCustom`（vscode API）
- `window.tabGroups.onDidChangeTabs` 等で Tab 変化を監視し、`Tab.input` の型で diff タブか判定できる。  
  - 参照: `TabGroups`（vscode API）

**結論**: 拡張機能ホスト側で diff タブの検知は可能。ただし **diff タブ自体は `TabInputTextDiff` であり custom editor (webview) ではない**ため、diff が開いたからといって webview に自動で「diff 表示」へ切替が掛かるわけではない。  
→ 切替が必要なら **拡張側で検知 → webview に通知** が必要。

参照:
- https://code.visualstudio.com/api/references/vscode-api?from=20423#TabInputTextDiff
- https://code.visualstudio.com/api/references/vscode-api?from=20423#TabInputCustom
- https://code.visualstudio.com/api/references/vscode-api?from=20423#TabGroups

## 2. HEAD / index の表示差（add 直後）
Git の `git diff` 仕様:
- `git diff` は **working tree と index の差分**  
- `git diff --cached` は **index と HEAD の差分**

**add 直後（index と working tree が一致）**では:
- index 基準（working tree vs index）は **差分なし**
- HEAD 基準（index vs HEAD）は **追加として差分あり**

参照:
- https://git-scm.com/docs/git-diff

## 3. 削除行の表現（vscode らしさ）
- VS Code のテーマ変数には diffEditor 系と diffEditorGutter 系があり、**行/ガター単位の差分可視化**が前提になっている。  
  - inserted/removed の背景色や境界色が定義済み

参照:
- https://code.visualstudio.com/api/references/theme-color#diff-editor-colors

**示唆**: 「通常エディタ内の差分表示」なら **削除テキストのウィジェット表示よりも、行/ガターのマーカー表示の方が VS Code に近い**。  
（※ diff ビューと同等にしたい場合は削除テキスト表示も検討）

## 4. 取得ロジック A/B の速度比較（現時点の見立て）
- A: Git 拡張 API  
  - repo 解決や状態管理は VS Code 側に寄せられるため、**安定性は高い**。  
  - ただし API 内部でも git 実行が行われるため、**実測が必要**。
- B: git CLI 直接  
  - **毎回プロセス起動コスト**が乗るが、挙動は最も明確。  
  - 差分再計算を頻繁に行うと遅くなりやすい。

**結論**: 速度差は理屈では決めづらい。**必ず計測ログで比較**する（`fetchBaseMs`, `bytes`, `provider`, `cacheHit`）。

## 5. 差分ロジックは 2 層
- 1層目: Markdown 文字列で **行レベル差分**  
- 2層目: 変更行内で **インライン差分**（PM の offset マッピングで Decoration 化）

## 6. 更新トリガは Worker がベストか？
**見解**:
- diff 計算を Worker に寄せるのは **UI フリーズ回避には有効**。  
- ただし **PM のマッピングと Decoration 生成はメインスレッド**に残る。  
- 小規模文書では Worker のオーバーヘッドが勝つ可能性があるため、**閾値で切替**が妥当。

**推奨**:  
`docLength/更新頻度` に応じて **Worker / main のハイブリッド**運用。
