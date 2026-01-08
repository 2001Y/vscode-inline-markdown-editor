# inlineMark

> [English](#english) | [日本語](#japanese) | [中文](#chinese)

---

<a id="english"></a>

## English

# inlineMark for VS Code

A powerful **WYSIWYG Markdown editor** extension for Visual Studio Code that transforms your Markdown editing experience with real-time rich text editing, live preview, and seamless synchronization.

### Features

#### Rich Text Editing with Tiptap
Edit Markdown files with a modern WYSIWYG editor powered by [Tiptap](https://tiptap.dev/). See your formatting in real-time as you type, with full support for:

- **Headings** (H1-H6) with visual hierarchy
- **Bold**, *italic*, ~~strikethrough~~, and `inline code`
- Bullet lists and numbered lists
- Blockquotes with nested content
- Code blocks with syntax highlighting
- Horizontal rules
- Links and images
- Tables (when HTML rendering is enabled)

#### Real-Time Bidirectional Sync
Your changes sync instantly between the rich text editor and the underlying Markdown file. The extension uses a sophisticated synchronization protocol with:

- **Optimistic updates** for instant feedback
- **Version tracking** to prevent conflicts
- **Automatic retry** on sync failures
- **Debounced saves** to reduce disk I/O

#### G5-lite Minimal Reformatting
Unlike other Markdown editors that reformat your entire document, this extension uses the **G5-lite algorithm** with [diff-match-patch](https://github.com/google/diff-match-patch) to make minimal changes to your source file. Your formatting preferences, whitespace, and style are preserved.

#### Security First
Built with security as a priority:

- **Content Security Policy (CSP)** with nonce-based script execution
- **DOMPurify sanitization** for HTML content rendering
- **Dangerous link blocking** - `command:`, `vscode:`, and `file:` schemes are always blocked
- **External link confirmation** - optionally prompt before opening external URLs
- **Workspace Trust integration** - respects VS Code's workspace trust settings
- **Local resource restrictions** - images are loaded securely via `asWebviewUri`

#### Image Support
- **Relative path resolution** - `![](./images/photo.png)` works automatically
- **Remote images** - configurable support for external image URLs
- **Secure loading** - all images are loaded through VS Code's secure webview URI system

#### RAW Block Preservation
Unsupported Markdown syntax like **YAML frontmatter** is preserved as editable RAW blocks. Your frontmatter, custom directives, and other non-standard syntax won't be lost or corrupted.

```yaml
---
title: My Document
date: 2024-01-01
tags: [markdown, editor]
---
```

#### Localization
Full internationalization support with built-in translations for:
- English
- Japanese (日本語)
- Chinese (中文)

#### VS Code Theme Integration
The editor automatically adapts to your VS Code theme, whether you prefer light, dark, or high contrast modes. All colors, fonts, and spacing follow your editor preferences.

#### Performance Optimized
- **Virtual scrolling** with CSS `content-visibility` for large documents
- **Efficient diff algorithm** for minimal memory usage
- **Debounced updates** to prevent UI lag

#### Comprehensive Logging
Debug issues easily with:
- **Output channel logging** in VS Code
- **JSONL file logging** to `_log_inlineMark/` folder next to edited files
- **Log export command** for sharing with support

### Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "inlineMark"
4. Click Install

Or install from the command line:
```bash
code --install-extension inlinemark
```

### Configuration

#### Editor Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.sync.debounceMs` | `250` | Delay before syncing changes (ms) |
| `inlineMark.sync.timeoutMs` | `3000` | Sync timeout before showing error |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5` | Maximum allowed change ratio (0-1) |
| `inlineMark.sync.changeGuard.maxChangedChars` | `50000` | Maximum changed characters |
| `inlineMark.sync.changeGuard.maxHunks` | `200` | Maximum change hunks |

#### Security Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.security.allowWorkspaceImages` | `true` | Allow loading workspace images |
| `inlineMark.security.allowRemoteImages` | `false` | Allow loading remote images |
| `inlineMark.security.allowInsecureRemoteImages` | `false` | Allow HTTP (non-HTTPS) images |
| `inlineMark.security.renderHtml` | `false` | Render HTML blocks (sanitized with DOMPurify) |
| `inlineMark.security.confirmExternalLinks` | `true` | Show confirmation before opening external links |

#### Debug Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMark.debug.enabled` | `false` | Enable debug mode: outputs JSONL logs to `_log_inlineMark/` folder |

### Commands

| Command | Description |
|---------|-------------|
| `inlineMark.resetSession` | Reset the editor session and resync |
| `inlineMark.reopenWithTextEditor` | Reopen with standard text editor |
| `inlineMark.applyRequiredSettings` | Apply recommended workspace settings |
| `inlineMark.exportLogs` | Export logs for debugging |

### Required Workspace Settings

For the best experience, the extension recommends these workspace settings:

```json
{
  "editor.formatOnSave": false,
  "files.autoSave": "off"
}
```

The extension will prompt you to apply these settings when you first open a Markdown file.

### Troubleshooting

#### Editor not loading
1. Check if the file is a valid `.md` file
2. Ensure workspace is trusted (File > Manage Workspace Trust)
3. Try the "Reset Session" command

#### Changes not syncing
1. Check the Output panel for errors (View > Output > inlineMark)
2. Ensure `editor.formatOnSave` is disabled
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

# inlineMark for VS Code

Visual Studio CodeでMarkdown編集体験を変革する強力な**WYSIWYGエディタ**拡張機能です。リアルタイムのリッチテキスト編集、ライブプレビュー、シームレスな同期を提供します。

### 機能

#### Tiptapによるリッチテキスト編集
[Tiptap](https://tiptap.dev/)を搭載したモダンなWYSIWYGエディタでMarkdownファイルを編集できます。入力しながらリアルタイムでフォーマットを確認できます：

- **見出し** (H1-H6) - 視覚的な階層表示
- **太字**、*斜体*、~~取り消し線~~、`インラインコード`
- 箇条書きリストと番号付きリスト
- ネストされた引用ブロック
- シンタックスハイライト付きコードブロック
- 水平線
- リンクと画像
- テーブル（HTMLレンダリング有効時）

### 設定

#### エディタ設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.sync.debounceMs` | `250` | 変更を同期するまでの遅延（ミリ秒） |
| `inlineMark.sync.timeoutMs` | `3000` | エラー表示までの同期タイムアウト |
| `inlineMark.sync.changeGuard.maxChangedRatio` | `0.5` | 最大許容変更率（0-1） |

#### セキュリティ設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.security.allowWorkspaceImages` | `true` | ワークスペース画像の読み込みを許可 |
| `inlineMark.security.allowRemoteImages` | `false` | リモート画像の読み込みを許可 |
| `inlineMark.security.renderHtml` | `false` | HTMLブロックをレンダリング |
| `inlineMark.security.confirmExternalLinks` | `true` | 外部リンクを開く前に確認を表示 |

#### デバッグ設定

| 設定 | デフォルト | 説明 |
|------|----------|------|
| `inlineMark.debug.enabled` | `false` | デバッグモード: `_log_inlineMark/` フォルダにJSONLログを出力 |

### コマンド

| コマンド | 説明 |
|---------|------|
| `inlineMark.resetSession` | エディタセッションをリセットして再同期 |
| `inlineMark.reopenWithTextEditor` | テキストエディタで開き直す |
| `inlineMark.applyRequiredSettings` | 推奨ワークスペース設定を適用 |
| `inlineMark.exportLogs` | デバッグ用にログをエクスポート |

### トラブルシューティング

#### エディタが読み込まれない
1. ファイルが有効な`.md`ファイルか確認
2. ワークスペースが信頼されているか確認（ファイル > ワークスペースの信頼を管理）
3. "セッションをリセット"コマンドを試す

#### 変更が同期されない
1. 出力パネルでエラーを確認（表示 > 出力 > inlineMark）
2. `editor.formatOnSave`が無効になっているか確認

---

<a id="chinese"></a>

## 中文

# inlineMark for VS Code

一款强大的 **所见即所得 Markdown 编辑器** VS Code 扩展，通过实时富文本编辑、实时预览和无缝同步，彻底改变您的 Markdown 编辑体验。

### 配置

#### 编辑器设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.sync.debounceMs` | `250` | 同步更改前的延迟（毫秒） |
| `inlineMark.sync.timeoutMs` | `3000` | 显示错误前的同步超时 |

#### 安全设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.security.allowWorkspaceImages` | `true` | 允许加载工作区图片 |
| `inlineMark.security.allowRemoteImages` | `false` | 允许加载远程图片 |
| `inlineMark.security.renderHtml` | `false` | 渲染 HTML 块 |
| `inlineMark.security.confirmExternalLinks` | `true` | 打开外部链接前显示确认 |

#### 调试设置

| 设置 | 默认值 | 描述 |
|------|--------|------|
| `inlineMark.debug.enabled` | `false` | 启用调试模式：将 JSONL 日志输出到 `_log_inlineMark/` 文件夹 |

### 命令

| 命令 | 描述 |
|------|------|
| `inlineMark.resetSession` | 重置编辑器会话并重新同步 |
| `inlineMark.reopenWithTextEditor` | 使用文本编辑器重新打开 |
| `inlineMark.applyRequiredSettings` | 应用推荐的工作区设置 |
| `inlineMark.exportLogs` | 导出日志用于调试 |

### 故障排除

#### 编辑器无法加载
1. 检查文件是否为有效的 `.md` 文件
2. 确保工作区受信任（文件 > 管理工作区信任）
3. 尝试"重置会话"命令

#### 更改未同步
1. 检查输出面板中的错误（查看 > 输出 > inlineMark）
2. 确保 `editor.formatOnSave` 已禁用

---

## Development

```bash
npm install
npm run build
npm run watch
```

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Keywords**: Markdown editor, VS Code extension, WYSIWYG, rich text editor, Tiptap, inlineMark
