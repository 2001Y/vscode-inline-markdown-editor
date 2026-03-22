# Mermaid visibility follow-up (2026-02-07)

## Symptoms
- Mermaid preview logged `Rendered` but users reported the diagram looked missing or unreadable.
- JSONL also contained repeated `Ignored non-protocol window message` for `inlineMarkPreviewHeight`.

## Root causes
1. Theme variable resolution used only `document.documentElement`; in some webview cases variables are present on `body`, causing fallback colors to be used unexpectedly.
2. Mermaid flowchart default `htmlLabels` depends on `foreignObject` + inline style paths that are fragile under strict CSP.
3. Non-protocol height messages polluted sync logs, making real errors harder to inspect.

## Fixes applied
- `packages/webview/src/editor/blockPreview.ts`
  - CSS variable resolution now checks both `:root` and `body`.
  - Mermaid iframe fallback SVG styling strengthened with `!important` for node/edge/label/cluster selectors.
- `packages/webview/src/preview/mermaidPreview.ts`
  - `flowchart.htmlLabels = false` to avoid CSP-fragile HTML label rendering.
- `packages/webview/src/protocol/client.ts`
  - Ignore `inlineMarkPreviewHeight` in protocol handler before warning logs.

## Validation
- `npm run build`: pass
- `npm run test`: pass
- `npm run package`: pass
