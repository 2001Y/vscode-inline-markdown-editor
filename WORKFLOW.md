---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: vscode-inline-markdown-editor-175c559a0114
polling:
  interval_ms: 5000
workspace:
  root: ~/code/workspaces
hooks:
  after_create: |
    set -eu
    git clone --depth 1 "${SOURCE_REPO_URL:-https://github.com/2001Y/vscode-inline-markdown-editor.git}" .
    npm ci
agent:
  max_concurrent_agents: 10
  max_turns: 20
codex:
  command: codex app-server
---
You are working on Linear issue `{{ issue.identifier }}`.

{% if attempt %}
Continuation context:
- This is retry attempt #{{ attempt }}.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat completed investigation or validation unless new code changes require it.
{% endif %}

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Repository context:
- This is a TypeScript monorepo for a VS Code Markdown editor.
- `packages/extension` owns the VS Code extension host, custom editor registration, commands, and tests.
- `packages/webview` owns the browser-side editor UI, Tiptap/ProseMirror extensions, and preview code.
- `_docs` is the external context window for research and implementation notes. Keep it current when you discover non-obvious behavior.

Working rules:
1. Read `AGENTS.md`, the root `package.json`, and the relevant package files before changing code.
2. Make the smallest correct change. Do not add compatibility shims, fallback paths, or extra abstraction unless the bug truly requires it.
3. Keep all work inside the repository copy. Do not touch unrelated paths.
4. Validate the touched area with the narrowest useful commands first, then finish with the broader checks that cover the change.
5. Typical verification is `npm run lint`, `npm run build`, and `npm run test` when extension behavior changes. For webview-only work, also run `npm run build:webview`.
6. If you discover an important implementation or workflow decision, record it in `_docs` before finishing.
7. If you are blocked by missing auth, permissions, or environment setup, report that explicitly and stop. Otherwise continue autonomously until the issue is complete.
