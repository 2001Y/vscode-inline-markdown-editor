/**
 * PlainTextBlock extension
 *
 * 役割: 任意ブロックを Markdown テキストとして編集するための一時ブロック
 * 方針: contentDOM で編集し、完了ボタンで Markdown を再パースして置換する
 * 不変条件: RAW(:::raw) ではなく、通常ブロックの編集モードとして使う
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { createDragHandleElement, shouldRenderBlockHandle } from './blockHandlesExtension.js';
import { notifyHostError } from './hostNotifier.js';
import { parseMarkdown } from './markdownUtils.js';
import { t } from './i18n.js';

const MODULE = 'PlainTextBlock';

export interface PlainTextBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

const ensureNonEmptyContent = (content: unknown): unknown[] => {
  if (Array.isArray(content) && content.length > 0) {
    return content;
  }
  return [{ type: 'paragraph' }];
};

const ensureListItemContent = (content: unknown): unknown[] => {
  const next = ensureNonEmptyContent(content);
  const first = next[0] as { type?: string } | undefined;
  if (!first?.type || (first.type !== 'paragraph' && first.type !== 'plainTextBlock')) {
    return [{ type: 'paragraph' }, ...next];
  }
  return next;
};

const resolvePlainTextContent = (editor: Editor, markdown: string): { content: unknown[] } | null => {
  const parsed = parseMarkdown(editor, markdown, { module: MODULE, markdownLength: markdown.length });
  if (!parsed || parsed.type !== 'doc') {
    return null;
  }
  const content = ensureNonEmptyContent(parsed.content);
  return { content };
};

export const PlainTextBlock = Node.create<PlainTextBlockOptions>({
  name: 'plainTextBlock',

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

  parseHTML() {
    return [
      {
        tag: 'div[data-type="plain-text-block"]',
      },
      {
        tag: 'pre[data-type="plain-text-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'plain-text-block',
        class: 'plain-text-block-wrapper',
      }),
      [
        'div',
        { class: 'block-content' },
        [
          'pre',
          {
            class: 'code-block plain-text-block',
            'data-type': 'plain-text-block',
            'data-language': 'markdown',
            'data-has-label': 'true',
          },
          ['code', { class: 'plain-text-content' }, 0],
        ],
      ],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentNode = node;
      const dom = document.createElement('div');
      dom.className = 'plain-text-block-wrapper';
      dom.setAttribute('data-type', 'plain-text-block');

      let handle: HTMLElement | null = null;

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      const pre = document.createElement('pre');
      pre.className = 'code-block plain-text-block';
      pre.setAttribute('data-type', 'plain-text-block');
      pre.setAttribute('data-language', 'markdown');
      pre.setAttribute('data-has-label', 'true');
      contentWrapper.appendChild(pre);

      const label = document.createElement('span');
      label.className = 'block-label code-block-label';
      label.setAttribute('contenteditable', 'false');

      const languageLabel = document.createElement('span');
      languageLabel.className = 'code-block-label-language';
      languageLabel.textContent = 'markdown';
      label.appendChild(languageLabel);
      pre.appendChild(label);

      const toolbar = document.createElement('span');
      toolbar.className = 'plain-text-toolbar';

      const doneButton = document.createElement('button');
      doneButton.type = 'button';
      doneButton.className = 'plain-text-done';
      doneButton.textContent = t().blockHandles.done;
      toolbar.appendChild(doneButton);

      pre.appendChild(toolbar);

      const contentDom = document.createElement('code');
      contentDom.className = 'plain-text-content';
      contentDom.spellcheck = false;
      pre.appendChild(contentDom);

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
          handle.dataset.blockType = 'plainTextBlock';
        } else {
          delete handle.dataset.blockPos;
        }
      };

      const syncHandleState = () => {
        const shouldShowHandle = shouldRenderBlockHandle(editor.state, getPos, 'plainTextBlock');
        dom.classList.toggle('block-handle-host', shouldShowHandle);

        if (shouldShowHandle && !handle) {
          handle = createDragHandleElement();
          handle.setAttribute('contenteditable', 'false');
          dom.insertBefore(handle, contentWrapper);
        } else if (!shouldShowHandle && handle) {
          handle.remove();
          handle = null;
        }
      };

      const applyParsedContent = (markdown: string) => {
        const parsed = resolvePlainTextContent(editor, markdown);
        if (!parsed) {
          notifyHostError('PLAIN_TEXT_PARSE_FAILED', 'Markdown の解析に失敗したため内容を適用できません。', {
            markdownLength: markdown.length,
          });
          return;
        }

        const pos = resolvePos();
        if (pos === null) {
          return;
        }

        const $pos = editor.state.doc.resolve(pos);
        const isInListItem = $pos.parent.type.name === 'listItem';

        if (isInListItem) {
          const content = ensureListItemContent(parsed.content);
          const from = $pos.start();
          const to = $pos.end();
          editor.chain().focus().insertContentAt({ from, to }, content).run();
          return;
        }

        const content = ensureNonEmptyContent(parsed.content);
        editor.chain().focus().insertContentAt({ from: pos, to: pos + currentNode.nodeSize }, content).run();
      };

      doneButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const markdown = contentDom.textContent ?? '';
        applyParsedContent(markdown);
      });

      syncHandleState();
      syncHandlePos();

      console.log('[PlainTextBlock] NodeView created', {
        contentLength: node.textContent.length,
      });

      return {
        dom,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'plainTextBlock') {
            return false;
          }
          currentNode = updatedNode;
          syncHandleState();
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
          if (toolbar.contains(event.target)) {
            return true;
          }
          return false;
        },
      };
    };
  },

  renderMarkdown: (node, h) => {
    if (!node || !Array.isArray(node.content)) {
      return '';
    }
    const content = h.renderChildren(node.content);
    return content;
  },
});

export default PlainTextBlock;
