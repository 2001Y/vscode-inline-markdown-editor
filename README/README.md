# inlineMark for VS Code

![inlineMark thumbnail](https://raw.githubusercontent.com/2001Y/vscode-inline-markdown-editor/main/assets/tmb.png)

> [English](#english) | [日本語](#日本語) | [中文](#中文)

---


## English

### Install and open

Requires **VS Code 1.105.0 or newer**. Install [inlineMark from the Marketplace](https://marketplace.visualstudio.com/items?itemName=2001y.inlinemark), then open a `.md` file. If it opens as text, use **Reopen Editor With…** and select inlineMark. Use **inlineMark: Reopen with Text Editor** to return to source editing.

### Current limitations

- This is a custom editor; standard VS Code navigation highlights, auto-reveal and Git dirty-diff decorations are not fully inherited.
- Find searches within text blocks; matches spanning blocks are not supported.
- ChangeGuard settings are currently exposed, but enforcement in the edit-apply path is disabled. Do not rely on them as a data-loss safeguard.
- Workspace-settings changes are offered separately. Review them before accepting; formatting behavior for other Markdown editing in that workspace can change.
- Remote images and HTML preview script/same-origin/popup/form permissions default to off. Enable only what your content needs.


### inlineMark for VS Code 📝

A powerful **WYSIWYG Markdown editor** extension for Visual Studio Code that transforms your Markdown editing experience with real-time rich text editing, live preview, and seamless synchronization.

### ✨ Features

#### 🎨 Rich Text Editing with Tiptap

Edit Markdown files with a modern WYSIWYG editor powered by [Tiptap](https://tiptap.dev/). See your formatting in real-time as you type, with full support for:

- **Headings** (H1-H6) with visual hierarchy
- **Bold**, *italic*, ~~strikethrough~~, and `inline code`
- Bullet lists and numbered lists
- Blockquotes with nested content
- Code blocks with syntax highlighting
- Horizontal rules
- Links and images
- **GFM Tables** with full editing support

#### 🔄 Real-Time Bidirectional Sync

Your changes sync instantly between the rich text editor and the underlying Markdown file. The extension uses a sophisticated synchronization protocol with:

- **Optimistic updates** for instant feedback
- **Version tracking** to prevent conflicts
- **Automatic retry** on sync failures
- **Debounced saves** to reduce disk I/O

#### 📄 G5-lite Minimal Reformatting

The extension computes text patches with [diff-match-patch](https://github.com/google/diff-match-patch) after serializing the editor content. This reduces the text changes applied to the source, but does not guarantee byte-for-byte preservation of Markdown formatting, whitespace, or unsupported syntax. Review the source diff when editing important files.

#### 🔒 Security First

Built with security as a priority:

- **Content Security Policy (CSP)** with nonce-based script execution
- **Dangerous link blocking** - `command:`, `vscode:`, and `file:` schemes are always blocked
- **External link confirmation** - optionally prompt before opening external URLs
- **Workspace Trust integration** - respects VS Code's workspace trust settings
- **Local resource restrictions** - workspace-local images are loaded via `asWebviewUri`

#### 🖼️ Image Support

- **Relative path resolution** - Workspace-relative image paths such as `./images/photo.png` are supported
- **Remote images** - configurable support for external image URLs
- **Workspace-local image loading** - Local images use VS Code webview URIs; allowed remote images retain their remote URLs

#### 📦 RAW Block Preservation

The editor has dedicated frontmatter and RAW-block handling for supported cases. This is not a guarantee that every custom directive or unsupported Markdown dialect round-trips unchanged. Keep a backup or use version control, and inspect source changes.

```yaml
---
title: My Document
date: 2024-01-01
tags: [markdown, editor]
---
```

#### 🌐 Localization

Full internationalization support with built-in translations for:

- 🇺🇸 English
- 🇯🇵 Japanese (日本語)
- 🇨🇳 Chinese (中文)

#### 🎯 VS Code Theme Integration

The editor automatically adapts to your VS Code theme, whether you prefer light, dark, or high contrast modes. All colors, fonts, and spacing follow your editor preferences.

#### ⚡ Performance Optimized

- **Debounced updates** to reduce synchronization frequency
- **Text patches** instead of replacing the entire source file on every edit
- Large-document performance depends on content and enabled previews; no fixed size or latency guarantee is made

#### 📊 Comprehensive Logging

Debug issues easily with:

- **Output channel logging** in VS Code
- **JSONL file logging** with automatic rotation
- **Log export command** for sharing with support

### ⚙️ Configuration

#### Editor Settings


| Setting                                       | Default | Description                        |
| --------------------------------------------- | ------- | ---------------------------------- |
| `inlineMark.sync.debounceMs`                  | `250`   | Delay before syncing changes (ms)  |
| `inlineMark.sync.timeoutMs`                   | `3000`  | Sync timeout before showing error  |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5`   | Maximum allowed change ratio (0-1) |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | Maximum allowed changed characters |
| `inlineMark.sync.changeGuard.maxHunks`        | `200`   | Maximum allowed diff hunks         |


#### Security Settings


| Setting                                         | Default | Description                                     |
| ----------------------------------------------- | ------- | ----------------------------------------------- |
| `inlineMark.security.allowWorkspaceImages`      | `true`  | Allow loading workspace images                  |
| `inlineMark.security.allowRemoteImages`         | `false` | Allow loading remote images                     |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | Allow HTTP (non-HTTPS) images                   |
| `inlineMark.security.confirmExternalLinks`      | `true`  | Show confirmation before opening external links |


#### Debug Settings


| Setting                    | Default | Description                                       |
| -------------------------- | ------- | ------------------------------------------------- |
| `inlineMark.debug.enabled` | `false` | Enable debug mode (JSONL logging, verbose output) |


#### Webview Settings


| Setting                                      | Default | Description                                                        |
| -------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `inlineMark.view.fullWidth`                  | `true`  | Use full width layout in the inlineMark editor                     |
| `inlineMark.view.noWrap`                     | `null`  | Disable line wrapping; when null follows VS Code `editor.wordWrap` |
| `inlineMark.webview.retainContextWhenHidden` | `true`  | Retain webview context when hidden                                 |


### 📋 Commands


| Command                            | Description                          |
| ---------------------------------- | ------------------------------------ |
| `inlineMark.resetSession`          | Reset the editor session and resync  |
| `inlineMark.applyRequiredSettings` | Apply recommended workspace settings |
| `inlineMark.exportLogs`            | Export logs for debugging            |
| `inlineMark.reopenWithTextEditor`  | Reopen with standard text editor     |


### ⚠️ Required Workspace Settings

For the best experience, the extension recommends these workspace settings:

```json
{
  "[markdown]": {
    "editor.formatOnSave": false,
    "editor.formatOnType": false,
    "editor.formatOnPaste": false,
    "editor.codeActionsOnSave": {},
    "files.trimTrailingWhitespace": false,
    "files.insertFinalNewline": false
  }
}
```

The extension will prompt you to apply these settings when you first open a Markdown file.

### 🔧 Troubleshooting

#### Editor not loading

1. Check if the file is a valid `.md` file
2. Ensure workspace is trusted (File > Manage Workspace Trust)
3. Try the "Reset Session" command

#### Changes not syncing

1. Check the Output panel for errors (View > Output > inlineMark)
2. Ensure `editor.formatOnSave` is disabled for Markdown
3. Try increasing `sync.debounceMs` if you have a slow disk

#### Images not displaying

1. For relative paths, ensure the image exists in your workspace
2. For remote images, enable `security.allowRemoteImages`
3. Check CSP errors in the Developer Tools (Help > Toggle Developer Tools)

---



## 日本語

### インストールと起動

**VS Code 1.105.0以降**が必要です。[MarketplaceからinlineMarkをインストール](https://marketplace.visualstudio.com/items?itemName=2001y.inlinemark)して `.md` ファイルを開きます。テキストで開く場合は「エディターを別のアプリケーションで開く…」からinlineMarkを選択してください。「inlineMark: テキストエディターで開き直す」相当のコマンドでソース編集へ戻せます（表示名は言語設定に従います）。

### 現在の制限

- カスタムエディターのため、通常のVS Codeの外部ジャンプ時の選択・スクロールやGit差分装飾は完全には引き継がれません。
- 検索はテキストブロック内が対象で、ブロックを跨ぐ一致には対応していません。
- ChangeGuard設定は表示されますが、編集適用時の強制チェックは現在無効です。データ保護の保証として利用しないでください。
- ワークスペース設定の変更は内容を確認してから適用してください。そのワークスペース内の他のMarkdown編集にも影響します。
- リモート画像とHTMLプレビューのscript/same-origin/popup/form許可は既定で無効です。必要なものだけ有効にしてください。


### VS Code用 inlineMark 📝

Visual Studio CodeでMarkdown編集体験を変革する強力な**WYSIWYGエディタ**拡張機能です。リアルタイムのリッチテキスト編集、ライブプレビュー、シームレスな同期を提供します。

### ✨ 機能

#### 🎨 Tiptapによるリッチテキスト編集

[Tiptap](https://tiptap.dev/)を搭載したモダンなWYSIWYGエディタでMarkdownファイルを編集できます。入力しながらリアルタイムでフォーマットを確認できます：

- **見出し** (H1-H6) - 視覚的な階層表示
- **太字**、*斜体*、~~取り消し線~~、`インラインコード`
- 箇条書きリストと番号付きリスト
- ネストされた引用ブロック
- シンタックスハイライト付きコードブロック
- 水平線
- リンクと画像
- **GFMテーブル** - 完全な編集サポート

#### 🔄 リアルタイム双方向同期

リッチテキストエディタと元のMarkdownファイル間で変更が即座に同期されます。高度な同期プロトコルを使用：

- **楽観的更新** - 即座のフィードバック
- **バージョン追跡** - 競合を防止
- **自動リトライ** - 同期失敗時
- **デバウンス保存** - ディスクI/Oを削減

#### 📄 G5-lite 最小限の再フォーマット

編集内容をMarkdownへシリアライズした後、[diff-match-patch](https://github.com/google/diff-match-patch)でテキスト差分を計算します。ソースへの変更を抑える仕組みですが、書式・空白・未対応構文のバイト単位の完全保持を保証するものではありません。重要なファイルではソース差分を確認してください。

#### 🔒 セキュリティ優先

セキュリティを最優先に設計：

- **コンテンツセキュリティポリシー (CSP)** - nonceベースのスクリプト実行
- **危険なリンクのブロック** - `command:`、`vscode:`、`file:`スキームは常にブロック
- **外部リンク確認** - 外部URLを開く前にオプションで確認
- **ワークスペース信頼統合** - VS Codeのワークスペース信頼設定を尊重
- **ローカルリソース制限** - ワークスペース内の画像は`asWebviewUri`経由で読み込み

#### 🖼️ 画像サポート

- **相対パス解決** - `./images/photo.png` など、ワークスペース内の相対画像パスに対応
- **リモート画像** - 外部画像URLの設定可能なサポート
- **ローカル画像の読み込み** - ローカル画像はVS Codeのwebview URIを使用し、許可されたリモート画像は元のURLを使用します

#### 📦 RAWブロック保持

フロントマターとRAWブロックには専用の処理があります。ただし、すべてのカスタムディレクティブやMarkdown方言が変更なく往復変換できるとは限りません。バックアップまたはバージョン管理を利用し、編集後のソース差分を確認してください。

```yaml
---
title: マイドキュメント
date: 2024-01-01
tags: [markdown, editor]
---
```

#### 🌐 ローカライゼーション

以下の言語の組み込み翻訳による完全な国際化サポート：

- 🇺🇸 英語
- 🇯🇵 日本語
- 🇨🇳 中国語

#### 🎯 VS Codeテーマ統合

エディタはVS Codeテーマに自動的に適応します。ライト、ダーク、ハイコントラストモードのいずれでも、すべての色、フォント、間隔がエディタの設定に従います。

#### ⚡ パフォーマンス最適化

- **デバウンス更新** - 同期の頻度を抑制
- **テキスト差分** - 編集ごとのソース全置換を回避
- 大きな文書の性能は内容やプレビュー設定に依存します。特定の文書サイズや応答時間は保証していません

#### 📊 包括的なログ

問題を簡単にデバッグ：

- **出力チャンネルログ** - VS Code内
- **JSONLファイルログ** - 自動ローテーション付き
- **ログエクスポートコマンド** - サポートとの共有用

### ⚙️ 設定

#### エディタ設定


| 設定                                            | デフォルト   | 説明                |
| --------------------------------------------- | ------- | ----------------- |
| `inlineMark.sync.debounceMs`                  | `250`   | 変更を同期するまでの遅延（ミリ秒） |
| `inlineMark.sync.timeoutMs`                   | `3000`  | エラー表示までの同期タイムアウト  |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5`   | 最大許容変更率（0-1）      |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | 最大許容変更文字数         |
| `inlineMark.sync.changeGuard.maxHunks`        | `200`   | 最大許容差分ハンク数        |


#### セキュリティ設定


| 設定                                              | デフォルト   | 説明                |
| ----------------------------------------------- | ------- | ----------------- |
| `inlineMark.security.allowWorkspaceImages`      | `true`  | ワークスペース画像の読み込みを許可 |
| `inlineMark.security.allowRemoteImages`         | `false` | リモート画像の読み込みを許可    |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | HTTP（非HTTPS）画像を許可 |
| `inlineMark.security.confirmExternalLinks`      | `true`  | 外部リンクを開く前に確認を表示   |


#### デバッグ設定


| 設定                         | デフォルト   | 説明                        |
| -------------------------- | ------- | ------------------------- |
| `inlineMark.debug.enabled` | `false` | デバッグモードを有効化（JSONLログ、詳細出力） |


#### Webview設定


| 設定                                           | デフォルト  | 説明                                                 |
| -------------------------------------------- | ------ | -------------------------------------------------- |
| `inlineMark.view.fullWidth`                  | `true` | inlineMark エディタを全幅で表示                              |
| `inlineMark.view.noWrap`                     | `null` | 折り返しを無効化。null の場合は VS Code の `editor.wordWrap` に追従 |
| `inlineMark.webview.retainContextWhenHidden` | `true` | 非表示時にWebviewコンテキストを保持                              |


### 📋 コマンド


| コマンド                               | 説明                  |
| ---------------------------------- | ------------------- |
| `inlineMark.resetSession`          | エディタセッションをリセットして再同期 |
| `inlineMark.applyRequiredSettings` | 推奨ワークスペース設定を適用      |
| `inlineMark.exportLogs`            | デバッグ用にログをエクスポート     |
| `inlineMark.reopenWithTextEditor`  | 標準テキストエディタで開き直す     |


### ⚠️ 必須ワークスペース設定

最良の体験のために、拡張機能は以下のワークスペース設定を推奨します：

```json
{
  "[markdown]": {
    "editor.formatOnSave": false,
    "editor.formatOnType": false,
    "editor.formatOnPaste": false,
    "editor.codeActionsOnSave": {},
    "files.trimTrailingWhitespace": false,
    "files.insertFinalNewline": false
  }
}
```

Markdownファイルを初めて開くと、これらの設定を適用するよう促されます。

### 🔧 トラブルシューティング

#### エディタが読み込まれない

1. ファイルが有効な`.md`ファイルか確認
2. ワークスペースが信頼されているか確認（ファイル > ワークスペースの信頼を管理）
3. "セッションをリセット"コマンドを試す

#### 変更が同期されない

1. 出力パネルでエラーを確認（表示 > 出力 > inlineMark）
2. Markdownで`editor.formatOnSave`が無効になっているか確認
3. ディスクが遅い場合は`sync.debounceMs`を増やしてみる

#### 画像が表示されない

1. 相対パスの場合、画像がワークスペースに存在するか確認
2. リモート画像の場合、`security.allowRemoteImages`を有効化
3. 開発者ツールでCSPエラーを確認（ヘルプ > 開発者ツールの切り替え）

---



## 中文

### 安装与打开

需要 **VS Code 1.105.0 或更新版本**。从 [Marketplace 安装 inlineMark](https://marketplace.visualstudio.com/items?itemName=2001y.inlinemark)，然后打开 `.md` 文件。如果显示为文本，请使用 **Reopen Editor With…** 选择 inlineMark。可通过 inlineMark 的重新以文本编辑器打开命令返回源文件。

### 当前限制

- 自定义编辑器不会完整继承 VS Code 的外部跳转高亮、自动滚动和 Git 差异装饰。
- 搜索限于文本块内部，不支持跨块匹配。
- ChangeGuard 设置仍可见，但编辑应用路径中的强制检查目前已禁用，不能作为数据保护保证。
- 接受工作区设置变更前请检查内容，这会影响该工作区的其他 Markdown 编辑。
- 远程图片及 HTML 预览的 script/same-origin/popup/form 权限默认关闭，只启用必要选项。


### VS Code inlineMark 📝

一款强大的 **所见即所得 Markdown 编辑器** VS Code 扩展，通过实时富文本编辑、实时预览和无缝同步，彻底改变您的 Markdown 编辑体验。

### ✨ 功能

#### 🎨 基于 Tiptap 的富文本编辑

使用由 [Tiptap](https://tiptap.dev/) 驱动的现代所见即所得编辑器编辑 Markdown 文件。在输入时实时查看格式，完全支持：

- **标题** (H1-H6) - 可视化层级
- **粗体**、*斜体*、~~删除线~~和`行内代码`
- 无序列表和有序列表
- 嵌套内容的引用块
- 带语法高亮的代码块
- 水平线
- 链接和图片
- **GFM 表格** - 完整编辑支持

#### 🔄 实时双向同步

您的更改会在富文本编辑器和底层 Markdown 文件之间即时同步。扩展使用复杂的同步协议：

- **乐观更新** - 即时反馈
- **版本跟踪** - 防止冲突
- **自动重试** - 同步失败时
- **防抖保存** - 减少磁盘 I/O

#### 📄 G5-lite 最小化重新格式化

扩展先将编辑内容序列化为 Markdown，再使用 [diff-match-patch](https://github.com/google/diff-match-patch) 计算文本补丁。这有助于减少源文件改动，但不保证格式、空白或不支持的语法逐字节保持不变。编辑重要文件时请检查源文件差异。

#### 🔒 安全优先

以安全为首要考虑：

- **内容安全策略 (CSP)** - 基于 nonce 的脚本执行
- **危险链接阻止** - `command:`、`vscode:` 和 `file:` 协议始终被阻止
- **外部链接确认** - 可选择在打开外部 URL 前提示
- **工作区信任集成** - 尊重 VS Code 的工作区信任设置
- **本地资源限制** - 工作区内的图片通过 `asWebviewUri` 加载

#### 🖼️ 图片支持

- **相对路径解析** - 支持 `./images/photo.png` 等工作区相对图片路径
- **远程图片** - 可配置的外部图片 URL 支持
- **本地图片加载** - 本地图片使用 VS Code webview URI；允许的远程图片保留其远程 URL

#### 📦 RAW 块保留

编辑器为 frontmatter 和受支持的 RAW 块提供专门处理，但不保证所有自定义指令或 Markdown 方言都能无损往返转换。请使用备份或版本控制，并检查编辑后的源文件差异。

```yaml
---
title: 我的文档
date: 2024-01-01
tags: [markdown, editor]
---
```

#### 🌐 本地化

完整的国际化支持，内置以下语言翻译：

- 🇺🇸 英语
- 🇯🇵 日语
- 🇨🇳 中文

#### 🎯 VS Code 主题集成

编辑器自动适应您的 VS Code 主题，无论您喜欢浅色、深色还是高对比度模式。所有颜色、字体和间距都遵循您的编辑器偏好。

#### ⚡ 性能优化

- **防抖更新** - 降低同步频率
- **文本补丁** - 避免每次编辑都替换整个源文件
- 大型文档的性能取决于内容和预览设置，不保证特定文档大小或响应时间

#### 📊 全面的日志记录

轻松调试问题：

- **输出通道日志** - 在 VS Code 中
- **JSONL 文件日志** - 自动轮换
- **日志导出命令** - 用于与支持人员共享

### ⚙️ 配置

#### 编辑器设置


| 设置                                            | 默认值     | 描述            |
| --------------------------------------------- | ------- | ------------- |
| `inlineMark.sync.debounceMs`                  | `250`   | 同步更改前的延迟（毫秒）  |
| `inlineMark.sync.timeoutMs`                   | `3000`  | 显示错误前的同步超时    |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5`   | 最大允许更改比率（0-1） |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | 最大允许更改字符数     |
| `inlineMark.sync.changeGuard.maxHunks`        | `200`   | 最大允许差异块数      |


#### 安全设置


| 设置                                              | 默认值     | 描述                 |
| ----------------------------------------------- | ------- | ------------------ |
| `inlineMark.security.allowWorkspaceImages`      | `true`  | 允许加载工作区图片          |
| `inlineMark.security.allowRemoteImages`         | `false` | 允许加载远程图片           |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | 允许 HTTP（非 HTTPS）图片 |
| `inlineMark.security.confirmExternalLinks`      | `true`  | 打开外部链接前显示确认        |


#### 调试设置


| 设置                         | 默认值     | 描述                    |
| -------------------------- | ------- | --------------------- |
| `inlineMark.debug.enabled` | `false` | 启用调试模式（JSONL 日志、详细输出） |


#### Webview 设置


| 设置                                           | 默认值    | 描述                                            |
| -------------------------------------------- | ------ | --------------------------------------------- |
| `inlineMark.view.fullWidth`                  | `true` | inlineMark 编辑器使用全宽布局                          |
| `inlineMark.view.noWrap`                     | `null` | 禁用自动换行；为 null 时跟随 VS Code 的 `editor.wordWrap` |
| `inlineMark.webview.retainContextWhenHidden` | `true` | 隐藏时保留 Webview 上下文                             |


### 📋 命令


| 命令                                 | 描述            |
| ---------------------------------- | ------------- |
| `inlineMark.resetSession`          | 重置编辑器会话并重新同步  |
| `inlineMark.applyRequiredSettings` | 应用推荐的工作区设置    |
| `inlineMark.exportLogs`            | 导出日志用于调试      |
| `inlineMark.reopenWithTextEditor`  | 使用标准文本编辑器重新打开 |


### ⚠️ 必需的工作区设置

为获得最佳体验，扩展推荐以下工作区设置：

```json
{
  "[markdown]": {
    "editor.formatOnSave": false,
    "editor.formatOnType": false,
    "editor.formatOnPaste": false,
    "editor.codeActionsOnSave": {},
    "files.trimTrailingWhitespace": false,
    "files.insertFinalNewline": false
  }
}
```

首次打开 Markdown 文件时，扩展会提示您应用这些设置。

### 🔧 故障排除

#### 编辑器无法加载

1. 检查文件是否为有效的 `.md` 文件
2. 确保工作区受信任（文件 > 管理工作区信任）
3. 尝试"重置会话"命令

#### 更改未同步

1. 检查输出面板中的错误（查看 > 输出 > inlineMark）
2. 确保 Markdown 的 `editor.formatOnSave` 已禁用
3. 如果磁盘较慢，尝试增加 `sync.debounceMs`

#### 图片不显示

1. 对于相对路径，确保图片存在于工作区中
2. 对于远程图片，启用 `security.allowRemoteImages`
3. 在开发者工具中检查 CSP 错误（帮助 > 切换开发者工具）

---

## 🛠️ Development

### Technical Stack

- **Editor**: [Tiptap](https://tiptap.dev/) - Modern WYSIWYG editor framework
- **Markdown Codec**: [@tiptap/markdown](https://tiptap.dev/docs/editor/extensions/functionality/markdown) - Bidirectional Markdown ↔ ProseMirror conversion with GFM support
- **GFM Tables**: [@tiptap/extension-table](https://tiptap.dev/docs/editor/extensions/nodes/table) - GitHub Flavored Markdown table support
- **Diff Algorithm**: [diff-match-patch](https://github.com/google/diff-match-patch) - G5-lite minimal reformatting
- **Build**: Vite (webview) + TypeScript (extension)

### Custom Extensions

- **RawBlock**: Preserves unsupported Markdown syntax (YAML frontmatter, etc.) as editable blocks

```bash
# Clone the repository
git clone https://github.com/2001Y/vscode-inline-markdown-editor.git
cd vscode-inline-markdown-editor

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch
```

## 📄 License

MIT License - see [LICENSE](https://github.com/2001Y/vscode-inline-markdown-editor/blob/main/LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING](https://github.com/2001Y/vscode-inline-markdown-editor/blob/main/CONTRIBUTING.md) before submitting a pull request.

## 🔗 Links

- [GitHub Repository](https://github.com/2001Y/vscode-inline-markdown-editor)
- [Issue Tracker](https://github.com/2001Y/vscode-inline-markdown-editor/issues)
- [Releases](https://github.com/2001Y/vscode-inline-markdown-editor/releases)

---

**Keywords**: Markdown editor, VS Code extension, WYSIWYG, rich text editor, Tiptap, real-time sync, live preview, Markdown preview, document editor, text editor, formatting, GitHub Flavored Markdown, GFM, content editing, technical writing, documentation, notes, blog writing

---

## 🛠️ 開発

### 技術スタック

- **Editor**: [Tiptap](https://tiptap.dev/) - モダンな WYSIWYG エディタフレームワーク
- **Markdown Codec**: [@tiptap/markdown](https://tiptap.dev/docs/editor/extensions/functionality/markdown) - GFM 対応の Markdown ↔ ProseMirror 変換
- **GFM Tables**: [@tiptap/extension-table](https://tiptap.dev/docs/editor/extensions/nodes/table) - GitHub Flavored Markdown テーブル対応
- **Diff Algorithm**: [diff-match-patch](https://github.com/google/diff-match-patch) - G5-lite 最小リフォーマット
- **Build**: Vite（webview）+ TypeScript（extension）

### カスタム拡張

- **RawBlock**: 未対応の Markdown 記法（YAML frontmatter など）を編集可能ブロックとして保持

```bash
# リポジトリをクローン
git clone https://github.com/2001Y/vscode-inline-markdown-editor.git
cd vscode-inline-markdown-editor

# 依存関係をインストール
npm install

# ビルド
npm run build

# ウォッチモード
npm run watch
```

## 📄 ライセンス

MIT License - 詳細は [LICENSE](https://github.com/2001Y/vscode-inline-markdown-editor/blob/main/LICENSE) を参照してください。

## 🤝 コントリビュート

コントリビューション歓迎です！PR を送る前に[コントリビューションガイド](https://github.com/2001Y/vscode-inline-markdown-editor/blob/main/CONTRIBUTING.md)をご確認ください。

## 🔗 リンク

- [GitHub リポジトリ](https://github.com/2001Y/vscode-inline-markdown-editor)
- [Issue Tracker](https://github.com/2001Y/vscode-inline-markdown-editor/issues)
- [Releases](https://github.com/2001Y/vscode-inline-markdown-editor/releases)

---

**キーワード**: Markdown editor, VS Code extension, WYSIWYG, rich text editor, Tiptap, real-time sync, live preview, Markdown preview, document editor, text editor, formatting, GitHub Flavored Markdown, GFM, content editing, technical writing, documentation, notes, blog writing

---

## 🛠️ 开发

### 技术栈

- **Editor**: [Tiptap](https://tiptap.dev/) - 现代 WYSIWYG 编辑器框架
- **Markdown Codec**: [@tiptap/markdown](https://tiptap.dev/docs/editor/extensions/functionality/markdown) - 支持 GFM 的 Markdown ↔ ProseMirror 转换
- **GFM Tables**: [@tiptap/extension-table](https://tiptap.dev/docs/editor/extensions/nodes/table) - GitHub Flavored Markdown 表格支持
- **Diff Algorithm**: [diff-match-patch](https://github.com/google/diff-match-patch) - G5-lite 最小重排
- **Build**: Vite（webview）+ TypeScript（extension）

### 自定义扩展

- **RawBlock**: 将不支持的 Markdown 语法（YAML frontmatter 等）作为可编辑块保留

```bash
# 克隆仓库
git clone https://github.com/2001Y/vscode-inline-markdown-editor.git
cd vscode-inline-markdown-editor

# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run watch
```

## 📄 许可证

MIT License - 详见 [LICENSE](https://github.com/2001Y/vscode-inline-markdown-editor/blob/main/LICENSE)。

## 🤝 贡献

欢迎贡献！提交 PR 前请阅读[贡献指南](https://github.com/2001Y/vscode-inline-markdown-editor/blob/main/CONTRIBUTING.md)。

## 🔗 链接

- [GitHub 仓库](https://github.com/2001Y/vscode-inline-markdown-editor)
- [Issue Tracker](https://github.com/2001Y/vscode-inline-markdown-editor/issues)
- [Releases](https://github.com/2001Y/vscode-inline-markdown-editor/releases)

---

**关键词**: Markdown editor, VS Code extension, WYSIWYG, rich text editor, Tiptap, real-time sync, live preview, Markdown preview, document editor, text editor, formatting, GitHub Flavored Markdown, GFM, content editing, technical writing, documentation, notes, blog writing
