# inlineMark for VS Code

> [English](#english) | [日本語](#japanese) | [中文](#chinese)

---

<a id="english"></a>

## English

# inlineMark for VS Code 📝

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
- Tables (when HTML rendering is enabled)

#### 🔄 Real-Time Bidirectional Sync
Your changes sync instantly between the rich text editor and the underlying Markdown file. The extension uses a sophisticated synchronization protocol with:

- **Optimistic updates** for instant feedback
- **Version tracking** to prevent conflicts
- **Automatic retry** on sync failures
- **Debounced saves** to reduce disk I/O

#### 📄 G5-lite Minimal Reformatting
Unlike other Markdown editors that reformat your entire document, this extension uses the **G5-lite algorithm** with [diff-match-patch](https://github.com/google/diff-match-patch) to make minimal changes to your source file. Your formatting preferences, whitespace, and style are preserved.

#### 🔒 Security First
Built with security as a priority:

- **Content Security Policy (CSP)** with nonce-based script execution
- **DOMPurify sanitization** for HTML content rendering
- **Dangerous link blocking** - `command:`, `vscode:`, and `file:` schemes are always blocked
- **External link confirmation** - optionally prompt before opening external URLs
- **Workspace Trust integration** - respects VS Code's workspace trust settings
- **Local resource restrictions** - images are loaded securely via `asWebviewUri`

#### 🖼️ Image Support
- **Relative path resolution** - `![](./images/photo.png)` works automatically
- **Remote images** - configurable support for external image URLs
- **Secure loading** - all images are loaded through VS Code's secure webview URI system

#### 📦 RAW Block Preservation
Unsupported Markdown syntax like **YAML frontmatter** is preserved as editable RAW blocks. Your frontmatter, custom directives, and other non-standard syntax won't be lost or corrupted.

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
- **Virtual scrolling** with CSS `content-visibility` for large documents
- **Efficient diff algorithm** for minimal memory usage
- **Debounced updates** to prevent UI lag

#### 📊 Comprehensive Logging
Debug issues easily with:
- **Output channel logging** in VS Code
- **JSONL file logging** with automatic rotation
- **Log export command** for sharing with support

### 🚀 Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "inlineMark"
4. Click Install

Or install from the command line:
```bash
code --install-extension inlinemark
```

Or download the VSIX from [Releases](https://github.com/2001Y/vscode-inline-markdown-editor/releases) and install manually.

### ⚙️ Configuration

#### Editor Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.sync.debounceMs` | `250` | Delay before syncing changes (ms) |
| `inlineMark.sync.timeoutMs` | `3000` | Sync timeout before showing error |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5` | Maximum allowed change ratio (0-1) |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | Maximum allowed changed characters |
| `inlineMark.sync.changeGuard.maxHunks` | `200` | Maximum allowed diff hunks |

#### Security Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.security.renderHtml` | `false` | Render HTML blocks (sanitized with DOMPurify) |
| `inlineMark.security.allowWorkspaceImages` | `true` | Allow loading workspace images |
| `inlineMark.security.allowRemoteImages` | `false` | Allow loading remote images |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | Allow HTTP (non-HTTPS) images |
| `inlineMark.security.confirmExternalLinks` | `true` | Show confirmation before opening external links |

#### Debug Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.debug.enabled` | `false` | Enable debug mode (JSONL logging, verbose output) |

#### Webview Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.webview.retainContextWhenHidden` | `true` | Retain webview context when hidden |

### 📋 Commands

| Command | Description |
|---------|-------------|
| `inlineMark.resetSession` | Reset the editor session and resync |
| `inlineMark.applyRequiredSettings` | Apply recommended workspace settings |
| `inlineMark.exportLogs` | Export logs for debugging |
| `inlineMark.reopenWithTextEditor` | Reopen with standard text editor |

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

#### HTML not rendering
1. Enable `security.renderHtml` in settings
2. Note: HTML is sanitized for security - some tags may be removed

---

<a id="japanese"></a>

## 日本語

# VS Code用 inlineMark 📝

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
- テーブル（HTMLレンダリング有効時）

#### 🔄 リアルタイム双方向同期
リッチテキストエディタと元のMarkdownファイル間で変更が即座に同期されます。高度な同期プロトコルを使用：

- **楽観的更新** - 即座のフィードバック
- **バージョン追跡** - 競合を防止
- **自動リトライ** - 同期失敗時
- **デバウンス保存** - ディスクI/Oを削減

#### 📄 G5-lite 最小限の再フォーマット
他のMarkdownエディタのようにドキュメント全体を再フォーマットするのではなく、[diff-match-patch](https://github.com/google/diff-match-patch)を使用した**G5-liteアルゴリズム**でソースファイルへの変更を最小限に抑えます。フォーマット設定、空白、スタイルが保持されます。

#### 🔒 セキュリティ優先
セキュリティを最優先に設計：

- **コンテンツセキュリティポリシー (CSP)** - nonceベースのスクリプト実行
- **DOMPurifyサニタイズ** - HTMLコンテンツのレンダリング
- **危険なリンクのブロック** - `command:`、`vscode:`、`file:`スキームは常にブロック
- **外部リンク確認** - 外部URLを開く前にオプションで確認
- **ワークスペース信頼統合** - VS Codeのワークスペース信頼設定を尊重
- **ローカルリソース制限** - 画像は`asWebviewUri`経由で安全に読み込み

#### 🖼️ 画像サポート
- **相対パス解決** - `![](./images/photo.png)`が自動的に動作
- **リモート画像** - 外部画像URLの設定可能なサポート
- **安全な読み込み** - すべての画像はVS Codeの安全なwebview URIシステム経由で読み込み

#### 📦 RAWブロック保持
**YAMLフロントマター**などの未対応Markdown構文は編集可能なRAWブロックとして保持されます。フロントマター、カスタムディレクティブ、その他の非標準構文は失われたり破損したりしません。

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
- **仮想スクロール** - 大きなドキュメント用のCSS `content-visibility`
- **効率的な差分アルゴリズム** - 最小限のメモリ使用
- **デバウンス更新** - UIラグを防止

#### 📊 包括的なログ
問題を簡単にデバッグ：
- **出力チャンネルログ** - VS Code内
- **JSONLファイルログ** - 自動ローテーション付き
- **ログエクスポートコマンド** - サポートとの共有用

### 🚀 インストール

1. VS Codeを開く
2. 拡張機能に移動 (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. "inlineMark"を検索
4. インストールをクリック

またはコマンドラインからインストール：
```bash
code --install-extension inlinemark
```

または[リリース](https://github.com/2001Y/vscode-inline-markdown-editor/releases)からVSIXをダウンロードして手動でインストール。

### ⚙️ 設定

#### エディタ設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.sync.debounceMs` | `250` | 変更を同期するまでの遅延（ミリ秒） |
| `inlineMark.sync.timeoutMs` | `3000` | エラー表示までの同期タイムアウト |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5` | 最大許容変更率（0-1） |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | 最大許容変更文字数 |
| `inlineMark.sync.changeGuard.maxHunks` | `200` | 最大許容差分ハンク数 |

#### セキュリティ設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.security.renderHtml` | `false` | HTMLブロックをレンダリング（DOMPurifyでサニタイズ） |
| `inlineMark.security.allowWorkspaceImages` | `true` | ワークスペース画像の読み込みを許可 |
| `inlineMark.security.allowRemoteImages` | `false` | リモート画像の読み込みを許可 |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | HTTP（非HTTPS）画像を許可 |
| `inlineMark.security.confirmExternalLinks` | `true` | 外部リンクを開く前に確認を表示 |

#### デバッグ設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.debug.enabled` | `false` | デバッグモードを有効化（JSONLログ、詳細出力） |

#### Webview設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.webview.retainContextWhenHidden` | `true` | 非表示時にWebviewコンテキストを保持 |

### 📋 コマンド

| コマンド | 説明 |
|---------|------|
| `inlineMark.resetSession` | エディタセッションをリセットして再同期 |
| `inlineMark.applyRequiredSettings` | 推奨ワークスペース設定を適用 |
| `inlineMark.exportLogs` | デバッグ用にログをエクスポート |
| `inlineMark.reopenWithTextEditor` | 標準テキストエディタで開き直す |

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

#### HTMLがレンダリングされない
1. 設定で`security.renderHtml`を有効化
2. 注意：セキュリティのためHTMLはサニタイズされます - 一部のタグは削除される場合があります

---

<a id="chinese"></a>

## 中文

# VS Code inlineMark 📝

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
- 表格（启用 HTML 渲染时）

#### 🔄 实时双向同步
您的更改会在富文本编辑器和底层 Markdown 文件之间即时同步。扩展使用复杂的同步协议：

- **乐观更新** - 即时反馈
- **版本跟踪** - 防止冲突
- **自动重试** - 同步失败时
- **防抖保存** - 减少磁盘 I/O

#### 📄 G5-lite 最小化重新格式化
与其他重新格式化整个文档的 Markdown 编辑器不同，此扩展使用 [diff-match-patch](https://github.com/google/diff-match-patch) 的 **G5-lite 算法**对源文件进行最小更改。您的格式偏好、空白和样式都会被保留。

#### 🔒 安全优先
以安全为首要考虑：

- **内容安全策略 (CSP)** - 基于 nonce 的脚本执行
- **DOMPurify 净化** - HTML 内容渲染
- **危险链接阻止** - `command:`、`vscode:` 和 `file:` 协议始终被阻止
- **外部链接确认** - 可选择在打开外部 URL 前提示
- **工作区信任集成** - 尊重 VS Code 的工作区信任设置
- **本地资源限制** - 图片通过 `asWebviewUri` 安全加载

#### 🖼️ 图片支持
- **相对路径解析** - `![](./images/photo.png)` 自动工作
- **远程图片** - 可配置的外部图片 URL 支持
- **安全加载** - 所有图片通过 VS Code 的安全 webview URI 系统加载

#### 📦 RAW 块保留
不支持的 Markdown 语法（如 **YAML frontmatter**）作为可编辑的 RAW 块保留。您的 frontmatter、自定义指令和其他非标准语法不会丢失或损坏。

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
- **虚拟滚动** - 大型文档使用 CSS `content-visibility`
- **高效差异算法** - 最小内存使用
- **防抖更新** - 防止 UI 卡顿

#### 📊 全面的日志记录
轻松调试问题：
- **输出通道日志** - 在 VS Code 中
- **JSONL 文件日志** - 自动轮换
- **日志导出命令** - 用于与支持人员共享

### 🚀 安装

1. 打开 VS Code
2. 转到扩展 (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. 搜索 "inlineMark"
4. 点击安装

或从命令行安装：
```bash
code --install-extension inlinemark
```

或从[发布页面](https://github.com/2001Y/vscode-inline-markdown-editor/releases)下载 VSIX 并手动安装。

### ⚙️ 配置

#### 编辑器设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.sync.debounceMs` | `250` | 同步更改前的延迟（毫秒） |
| `inlineMark.sync.timeoutMs` | `3000` | 显示错误前的同步超时 |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5` | 最大允许更改比率（0-1） |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | 最大允许更改字符数 |
| `inlineMark.sync.changeGuard.maxHunks` | `200` | 最大允许差异块数 |

#### 安全设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.security.renderHtml` | `false` | 渲染 HTML 块（使用 DOMPurify 净化） |
| `inlineMark.security.allowWorkspaceImages` | `true` | 允许加载工作区图片 |
| `inlineMark.security.allowRemoteImages` | `false` | 允许加载远程图片 |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | 允许 HTTP（非 HTTPS）图片 |
| `inlineMark.security.confirmExternalLinks` | `true` | 打开外部链接前显示确认 |

#### 调试设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.debug.enabled` | `false` | 启用调试模式（JSONL 日志、详细输出） |

#### Webview 设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.webview.retainContextWhenHidden` | `true` | 隐藏时保留 Webview 上下文 |

### 📋 命令

| 命令 | 描述 |
|------|------|
| `inlineMark.resetSession` | 重置编辑器会话并重新同步 |
| `inlineMark.applyRequiredSettings` | 应用推荐的工作区设置 |
| `inlineMark.exportLogs` | 导出日志用于调试 |
| `inlineMark.reopenWithTextEditor` | 使用标准文本编辑器重新打开 |

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

#### HTML 未渲染
1. 在设置中启用 `security.renderHtml`
2. 注意：出于安全考虑，HTML 会被净化 - 某些标签可能会被删除

---

## 🛠️ Development

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

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a pull request.

## 🔗 Links

- [GitHub Repository](https://github.com/2001Y/vscode-inline-markdown-editor)
- [Issue Tracker](https://github.com/2001Y/vscode-inline-markdown-editor/issues)
- [Releases](https://github.com/2001Y/vscode-inline-markdown-editor/releases)

---

**Keywords**: Markdown editor, VS Code extension, WYSIWYG, rich text editor, Tiptap, real-time sync, live preview, Markdown preview, document editor, text editor, formatting, GitHub Flavored Markdown, GFM, content editing, technical writing, documentation, notes, blog writing
