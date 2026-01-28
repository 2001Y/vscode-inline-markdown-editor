/**
 * FrontmatterBlock extension
 *
 * 役割: YAML frontmatter を専用ブロックとして保持・編集する
 * 方針: contentDOM で編集し、Markdown ではそのまま出力する
 * 不変条件: RAW(:::raw) と混同しない
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { MarkdownToken, MarkdownParseHelpers } from '@tiptap/core';
import { applyIndentAttributesToDom, indentAttribute, normalizeIndentAttr, renderIndentMarker } from './indentConfig.js';
import { createDragHandleElement, shouldRenderBlockHandle } from './blockHandlesExtension.js';
import { notifyHostWarn } from './hostNotifier.js';

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

const normalizeFrontmatter = (content: string): string => {
  return content.endsWith('\n') ? content : `${content}\n`;
};

export interface FrontmatterBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const FrontmatterBlock = Node.create<FrontmatterBlockOptions>({
  name: 'frontmatterBlock',

  group: 'block',

  content: 'text*',

  code: true,

  marks: '',

  defining: true,

  isolating: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      indent: indentAttribute,
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="frontmatter-block"]',
      },
      {
        tag: 'pre[data-type="frontmatter-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'frontmatter-block',
        class: 'frontmatter-block-wrapper',
      }),
      [
        'div',
        { class: 'block-content' },
        [
          'pre',
          {
            class: 'code-block frontmatter-block',
            'data-type': 'frontmatter-block',
            'data-has-label': 'true',
          },
          ['code', { class: 'frontmatter-block-content' }, 0],
        ],
      ],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'frontmatter-block');
      dom.className = 'frontmatter-block-wrapper';
      applyIndentAttributesToDom(dom, node.attrs?.indent);

      let handle: HTMLElement | null = null;

      const resolvePos = () => {
        const pos = getPos();
        return typeof pos === 'number' ? pos : null;
      };

      const syncHandlePos = () => {
        if (!handle) {
          return;
        }
        const pos = resolvePos();
        if (typeof pos === 'number') {
          handle.dataset.blockPos = String(pos);
          handle.dataset.blockType = 'frontmatterBlock';
        } else {
          delete handle.dataset.blockPos;
        }
      };

      const syncHandleState = (updatedNode: typeof node) => {
        const shouldShowHandle = shouldRenderBlockHandle(editor.state, getPos, 'frontmatterBlock');
        dom.classList.toggle('block-handle-host', shouldShowHandle);

        if (shouldShowHandle && !handle) {
          handle = createDragHandleElement();
          handle.setAttribute('contenteditable', 'false');
          dom.appendChild(handle);
        } else if (!shouldShowHandle && handle) {
          handle.remove();
          handle = null;
        }

        applyIndentAttributesToDom(dom, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      syncHandleState(node);
      syncHandlePos();

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      const pre = document.createElement('pre');
      pre.className = 'code-block frontmatter-block';
      pre.setAttribute('data-type', 'frontmatter-block');
      pre.setAttribute('data-has-label', 'true');
      contentWrapper.appendChild(pre);

      const label = document.createElement('span');
      label.className = 'block-label';
      label.setAttribute('contenteditable', 'false');

      const labelText = document.createElement('span');
      labelText.textContent = 'Frontmatter';
      label.appendChild(labelText);

      pre.appendChild(label);

      const contentDom = document.createElement('code');
      contentDom.className = 'frontmatter-block-content';
      contentDom.spellcheck = false;
      pre.appendChild(contentDom);

      console.log('[FrontmatterBlock] NodeView created', {
        contentLength: node.textContent.length,
      });

      return {
        dom,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'frontmatterBlock') {
            return false;
          }
          syncHandleState(updatedNode);
          syncHandlePos();
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          if (handle && handle.contains(event.target)) {
            return true;
          }
          if (label.contains(event.target)) {
            return true;
          }
          return false;
        },
      };
    };
  },

  markdownTokenizer: {
    name: 'frontmatterBlock',
    level: 'block' as const,
    start: (src: string) => {
      if (src.startsWith('\ufeff---')) {
        return 1;
      }
      return src.startsWith('---') ? 0 : -1;
    },
    tokenize: (src: string, tokens: MarkdownToken[]) => {
      if (tokens.length > 0) {
        return undefined;
      }
      const hasBom = src.charCodeAt(0) === 0xfeff;
      const normalized = hasBom ? src.slice(1) : src;
      if (!normalized.startsWith('---')) {
        return undefined;
      }
      const match = FRONTMATTER_RE.exec(normalized);
      if (!match) {
        return undefined;
      }
      const raw = hasBom ? `\ufeff${match[0]}` : match[0];
      return {
        type: 'frontmatterBlock',
        raw,
        text: raw,
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    const raw = token.raw || '';
    const normalized = raw.trimEnd();
    console.log('[FrontmatterBlock] parseMarkdown', { contentLength: normalized.length });
    return helpers.createNode(
      'frontmatterBlock',
      {},
      normalized ? [helpers.createTextNode(normalized)] : []
    );
  },

  renderMarkdown: (
    node: { attrs?: { indent?: number }; content?: unknown },
    helpers: { renderChildren?: (content: unknown) => string },
    context?: { parentType?: { name?: string } }
  ) => {
    const renderChildren = helpers?.renderChildren;
    const content = renderChildren ? renderChildren(node.content ?? '') : '';
    const trimmed = content.trimEnd();
    console.log('[FrontmatterBlock] renderMarkdown', { contentLength: trimmed.length });

    if (!FRONTMATTER_RE.test(normalizeFrontmatter(trimmed))) {
      notifyHostWarn('FRONTMATTER_INVALID', 'Frontmatter の形式が崩れています。', {
        contentLength: trimmed.length,
      });
    }

    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);

    return `${marker}${normalizeFrontmatter(trimmed)}`;
  },
});

export default FrontmatterBlock;
