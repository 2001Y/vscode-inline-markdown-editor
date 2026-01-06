# Inline Markdown Editor for VS Code 📝

A powerful **WYSIWYG Markdown editor** extension for Visual Studio Code that transforms your Markdown editing experience with real-time rich text editing, live preview, and seamless synchronization.

## ✨ Features

### 🎨 Rich Text Editing with Tiptap
Edit Markdown files with a modern WYSIWYG editor powered by [Tiptap](https://tiptap.dev/). See your formatting in real-time as you type, with full support for:

- **Headings** (H1-H6) with visual hierarchy
- **Bold**, *italic*, ~~strikethrough~~, and `inline code`
- Bullet lists and numbered lists
- Blockquotes with nested content
- Code blocks with syntax highlighting
- Horizontal rules
- Links and images
- Tables (when HTML rendering is enabled)

### 🔄 Real-Time Bidirectional Sync
Your changes sync instantly between the rich text editor and the underlying Markdown file. The extension uses a sophisticated synchronization protocol with:

- **Optimistic updates** for instant feedback
- **Version tracking** to prevent conflicts
- **Automatic retry** on sync failures
- **Debounced saves** to reduce disk I/O

### 📄 G5-lite Minimal Reformatting
Unlike other Markdown editors that reformat your entire document, this extension uses the **G5-lite algorithm** with [diff-match-patch](https://github.com/google/diff-match-patch) to make minimal changes to your source file. Your formatting preferences, whitespace, and style are preserved.

### 🔒 Security First
Built with security as a priority:

- **Content Security Policy (CSP)** with nonce-based script execution
- **DOMPurify sanitization** for HTML content rendering
- **Dangerous link blocking** - `command:`, `vscode:`, and `file:` schemes are always blocked
- **External link confirmation** - optionally prompt before opening external URLs
- **Workspace Trust integration** - respects VS Code's workspace trust settings
- **Local resource restrictions** - images are loaded securely via `asWebviewUri`

### 🖼️ Image Support
- **Relative path resolution** - `![](./images/photo.png)` works automatically
- **Remote images** - configurable support for external image URLs
- **Secure loading** - all images are loaded through VS Code's secure webview URI system

### 📦 RAW Block Preservation
Unsupported Markdown syntax like **YAML frontmatter** is preserved as editable RAW blocks. Your frontmatter, custom directives, and other non-standard syntax won't be lost or corrupted.

```yaml
---
title: My Document
date: 2024-01-01
tags: [markdown, editor]
---
```

### 🌐 Localization
Full internationalization support with built-in translations for:
- 🇺🇸 English
- 🇯🇵 Japanese (日本語)
- 🇨🇳 Chinese (中文)

### 🎯 VS Code Theme Integration
The editor automatically adapts to your VS Code theme, whether you prefer light, dark, or high contrast modes. All colors, fonts, and spacing follow your editor preferences.

### ⚡ Performance Optimized
- **Virtual scrolling** with CSS `content-visibility` for large documents
- **Efficient diff algorithm** for minimal memory usage
- **Debounced updates** to prevent UI lag

### 📊 Comprehensive Logging
Debug issues easily with:
- **Output channel logging** in VS Code
- **JSONL file logging** with automatic rotation
- **Log export command** for sharing with support

## 🚀 Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Inline Markdown Editor"
4. Click Install

Or install from the command line:
```bash
code --install-extension inline-markdown-editor
```

## ⚙️ Configuration

### Editor Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMarkdownEditor.sync.debounceMs` | `300` | Delay before syncing changes (ms) |
| `inlineMarkdownEditor.sync.timeoutMs` | `5000` | Sync timeout before showing error |
| `inlineMarkdownEditor.changeGuard.maxDiffRatio` | `0.5` | Maximum allowed change ratio (0-1) |
| `inlineMarkdownEditor.changeGuard.minLength` | `100` | Minimum length for change guard |

### Security Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMarkdownEditor.security.renderHtml` | `false` | Render HTML blocks (sanitized with DOMPurify) |
| `inlineMarkdownEditor.security.allowRemoteImages` | `false` | Allow loading remote images |
| `inlineMarkdownEditor.security.allowInsecureRemoteImages` | `false` | Allow HTTP (non-HTTPS) images |
| `inlineMarkdownEditor.security.confirmExternalLinks` | `true` | Show confirmation before opening external links |

### Logging Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `inlineMarkdownEditor.log.level` | `"info"` | Log level: debug, info, warn, error |
| `inlineMarkdownEditor.log.enableFileLog` | `false` | Enable JSONL file logging |
| `inlineMarkdownEditor.log.maxFileSizeKB` | `1024` | Max log file size before rotation |
| `inlineMarkdownEditor.log.retentionDays` | `7` | Days to keep old log files |

## 📋 Commands

| Command | Description |
|---------|-------------|
| `inlineMarkdownEditor.resetSession` | Reset the editor session and resync |
| `inlineMarkdownEditor.applyRequiredSettings` | Apply recommended workspace settings |
| `inlineMarkdownEditor.exportLogs` | Export logs for debugging |

## ⚠️ Required Workspace Settings

For the best experience, the extension recommends these workspace settings:

```json
{
  "editor.formatOnSave": false,
  "files.autoSave": "off"
}
```

The extension will prompt you to apply these settings when you first open a Markdown file.

## 🔧 Troubleshooting

### Editor not loading
1. Check if the file is a valid `.md` file
2. Ensure workspace is trusted (File > Manage Workspace Trust)
3. Try the "Reset Session" command

### Changes not syncing
1. Check the Output panel for errors (View > Output > Inline Markdown Editor)
2. Ensure `editor.formatOnSave` is disabled
3. Try increasing `sync.debounceMs` if you have a slow disk

### Images not displaying
1. For relative paths, ensure the image exists in your workspace
2. For remote images, enable `security.allowRemoteImages`
3. Check CSP errors in the Developer Tools (Help > Toggle Developer Tools)

### HTML not rendering
1. Enable `security.renderHtml` in settings
2. Note: HTML is sanitized for security - some tags may be removed

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/2001Y/VSCode-Extension.git
cd VSCode-Extension

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

- [GitHub Repository](https://github.com/2001Y/VSCode-Extension)
- [Issue Tracker](https://github.com/2001Y/VSCode-Extension/issues)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=inline-markdown-editor)

---

**Keywords**: Markdown editor, VS Code extension, WYSIWYG, rich text editor, Tiptap, real-time sync, live preview, Markdown preview, document editor, text editor, formatting, GitHub Flavored Markdown, GFM, content editing, technical writing, documentation, notes, blog writing
