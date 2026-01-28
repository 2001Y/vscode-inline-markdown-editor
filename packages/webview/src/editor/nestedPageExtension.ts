/**
 * 役割: Notion風ネストページブロックの Tiptap 拡張
 * 責務: nestedPage ノードの表示と Markdown との往復を提供
 * 不変条件:
 * - ネストページは atom block として扱う
 * - path は必須属性（欠落時はエラー扱い）
 * - renderMarkdown は canonical 構文へ正規化する
 */

import { Node, mergeAttributes, createAtomBlockMarkdownSpec } from '@tiptap/core';
import { applyIndentAttributesToDom, indentAttribute, normalizeIndentAttr, renderIndentMarker } from './indentConfig.js';
import { icons } from './icons.js';

const NESTED_PAGE_FALLBACK = 'Nested Page';
import { createDragHandleElement, shouldRenderBlockHandle } from './blockHandlesExtension.js';

export interface NestedPageOptions {
  HTMLAttributes: Record<string, unknown>;
  onOpen?: (path: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    nestedPage: {
      setNestedPage: (attributes: { title: string; path: string; indent?: number }) => ReturnType;
    };
  }
}

const markdownSpec = createAtomBlockMarkdownSpec({
  nodeName: 'nestedPage',
  name: 'nested-page',
  requiredAttributes: ['path'],
  allowedAttributes: ['path', 'title', 'indent'],
});

export const NestedPage = Node.create<NestedPageOptions>({
  name: 'nestedPage',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onOpen: undefined,
    };
  },

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-title'),
        renderHTML: (attributes) => {
          if (!attributes.title) {
            return {};
          }
          return { 'data-title': attributes.title };
        },
      },
      path: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-path'),
        renderHTML: (attributes) => {
          if (!attributes.path) {
            return {};
          }
          return { 'data-path': attributes.path };
        },
      },
      indent: indentAttribute,
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="nested-page"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = node.attrs?.title ? String(node.attrs.title) : '';
    const path = node.attrs?.path ? String(node.attrs.path) : '';
    const fallback = title || path || NESTED_PAGE_FALLBACK;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'nested-page',
        class: 'nested-page',
        ...(title ? { 'data-title': title } : {}),
        ...(path ? { 'data-path': path } : {}),
        contenteditable: 'false',
      }),
      ['span', { class: 'nested-page-title' }, fallback],
    ];
  },

  addNodeView() {
    return ({ node, getPos }) => {
      let currentNode = node;
      const dom = document.createElement('div');
      dom.className = 'nested-page';
      dom.setAttribute('data-type', 'nested-page');
      dom.contentEditable = 'false';
      applyIndentAttributesToDom(dom, node.attrs?.indent);

      let handle: HTMLElement | null = null;

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nested-page-button';
      button.setAttribute('data-role', 'nested-page-open');

      const icon = document.createElement('span');
      icon.className = 'nested-page-icon';
      icon.innerHTML = icons.fileText;
      button.appendChild(icon);

      const text = document.createElement('span');
      text.className = 'nested-page-text';

      const title = document.createElement('span');
      title.className = 'nested-page-title';

      const path = document.createElement('span');
      path.className = 'nested-page-path';

      text.appendChild(title);
      text.appendChild(path);
      button.appendChild(text);
      contentWrapper.appendChild(button);

      const resolvePos = () => {
        const pos = getPos();
        return typeof pos === 'number' ? pos : null;
      };

      const syncHandlePos = () => {
        if (!handle) {
          return;
        }
        const pos = resolvePos();
        if (pos !== null) {
          handle.dataset.blockPos = String(pos);
          handle.dataset.blockType = 'nestedPage';
        } else {
          delete handle.dataset.blockPos;
        }
      };

      const syncHandleState = (updatedNode: typeof node) => {
        const shouldShowHandle = shouldRenderBlockHandle(this.editor.state, getPos, 'nestedPage');
        dom.classList.toggle('block-handle-host', shouldShowHandle);

        if (shouldShowHandle && !handle) {
          handle = createDragHandleElement();
          handle.setAttribute('contenteditable', 'false');
          dom.insertBefore(handle, contentWrapper);
        } else if (!shouldShowHandle && handle) {
          handle.remove();
          handle = null;
        }

        applyIndentAttributesToDom(dom, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      const updateView = (updatedNode: typeof node) => {
        const nextTitle = updatedNode.attrs?.title ? String(updatedNode.attrs.title) : '';
        const nextPath = updatedNode.attrs?.path ? String(updatedNode.attrs.path) : '';
        title.textContent = nextTitle || nextPath || NESTED_PAGE_FALLBACK;
        path.textContent = nextPath ? nextPath : '';
        dom.dataset.title = nextTitle;
        dom.dataset.path = nextPath;
        dom.classList.toggle('is-error', !nextPath);
      };

      updateView(node);
      syncHandleState(node);
      syncHandlePos();

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const nextPath = String(currentNode.attrs?.path || '');
        if (!nextPath) {
          console.error('[NestedPage] Open blocked: missing path');
          dom.classList.add('is-error');
          return;
        }
        if (this.options.onOpen) {
          this.options.onOpen(nextPath);
        }
      };

      button.addEventListener('click', handleClick);

      return {
        dom,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'nestedPage') {
            return false;
          }
          currentNode = updatedNode;
          updateView(updatedNode);
          syncHandleState(updatedNode);
          syncHandlePos();
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          if (button.contains(event.target)) {
            return true;
          }
          if (handle && handle.contains(event.target)) {
            return true;
          }
          return false;
        },
        destroy: () => {
          button.removeEventListener('click', handleClick);
        },
      };
    };
  },

  addCommands() {
    return {
      setNestedPage:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },

  markdownTokenizer: markdownSpec.markdownTokenizer,

  parseMarkdown: markdownSpec.parseMarkdown,

  renderMarkdown: (node, _h, context) => {
    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    const content = markdownSpec.renderMarkdown(node);
    return `${marker}${content}`;
  },
});

export default NestedPage;
