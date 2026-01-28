# ネストページ作成タイムアウト調査 (o3)

## 結論(要点)
- Webview が `nestedPageCreateAck` を受け取れていない場合、**sessionId フィルタで破棄**している可能性が高い。
- 返信先の WebviewPanel が「要求元と一致していない」ケースもよくある（複数パネル/再起動/再解決）。
- `postMessage` の戻り値(false/例外)をログしていないと「無音失敗」になる。

## 有力な原因候補
1) **sessionId mismatch** で ACK をドロップ
   - 作成完了/失敗は許可していても ACK だけ拒否されると、
     3s timeout で pending が消えて以降の返信を無視する。
2) **別パネルへ postMessage**
   - create を受けた panel と違う panel に送っていると、要求元は永遠に待つ。
3) **postMessage が失敗**
   - `postMessage` が `false` を返す or throw していても気づけない。

## 対策案
- sessionId mismatch でも **pending な requestId の ACK を許可**する。
- 返信は「要求元 panel」で送る or **全 panel にブロードキャスト**して requestId でフィルタ。
- `postMessage` を **必ず await** して成功/失敗をログ化。
- create timeout を 3s 以上に拡張（ネットワーク/ファイルI/O遅延を考慮）。

## 参考
- o3 (VS Code extension/webview) 相談結果
