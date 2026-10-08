# inlineMark for VS Code

Edit Markdown visually inside VS Code with a Tiptap-based custom editor, while keeping `.md` files in your workspace.

- [Install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=2001y.inlinemark)
- [English documentation](README/README.md#english) · [日本語](README/README.md#日本語) · [中文](README/README.md#中文)
- [Report a bug](https://github.com/2001Y/vscode-inline-markdown-editor/issues) · [Contributing](CONTRIBUTING.md) · [Release checks](docs/release-checklist.md)

Requires **VS Code 1.105.0 or newer**. Open a `.md` file with inlineMark using **Reopen Editor With…**. You can reopen it in the standard text editor at any time.

## What it supports

Headings, lists, tables, code blocks, links, images, preview blocks, and bidirectional synchronization with the workspace document. Dedicated frontmatter and RAW-block handling covers supported special syntax.

## Before editing important files

Use version control or keep a backup. Markdown is parsed and serialized, so text patches do not guarantee byte-for-byte preservation of every dialect or formatting choice. Review the source diff. Standard-editor navigation and Git diff decorations are not fully reproduced. ChangeGuard enforcement is currently disabled in the edit-apply path.

## Development

Use a supported Node.js version compatible with the locked dependencies (Node.js 22.12+ or 24 recommended), and npm.

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm test
npm run package
```

`typecheck` checks both the extension and webview with their strict TypeScript settings. `test:unit` covers text-patch/protocol validation, mocked host paths, and selected real Markdown-codec cases without launching VS Code. These samples do not guarantee complete dialect fidelity or UI behavior. `npm test` additionally launches the VS Code extension-host tests and requires a display plus access to the VS Code download service. See [release checks](docs/release-checklist.md) for UI, round-trip, and distribution verification that remains separate.

MIT licensed. See [LICENSE](LICENSE).
