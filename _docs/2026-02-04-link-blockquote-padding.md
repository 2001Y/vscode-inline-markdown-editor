# 2026-02-04 リンク下線 / blockquote余白 / 下部余白

## 目的
- リンクを常時下線表示し、Cmd/Ctrl 押下中の hover だけ pointer に。
- blockquote を code block 相当の余白・角丸・背景に合わせる。
- editor-container の下部に 90vh の余白を追加。

## 変更点
- `styles.css`
  - `a` を常時 underline。
  - `body.inline-markdown-link-modifier a:hover` で pointer。
  - `blockquote` を `padding: 12px 16px`, `border-radius: 6px`, `margin: 1em 0`, `overflow: hidden`。
  - `blockquote > .block-content` の margin を 0 に調整。
  - `.editor-container` に `padding-bottom: 90vh` 追加。

## 補足
- Cmd/Ctrl キーの状態は JS で `body` クラスを切り替え済み。
  CSS だけでキー状態は取得できないため、最小の class 切替で実現。 
