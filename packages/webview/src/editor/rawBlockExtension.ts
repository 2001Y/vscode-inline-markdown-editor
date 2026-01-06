/**
 * Role: Tiptap extension for RAW blocks
 * Responsibility: Render unsupported Markdown syntax (frontmatter, etc.) as EDITABLE blocks
 * Invariant: RAW blocks preserve their content exactly and are serialized back unchanged
 * Note: Per spec 12.3.4, RAW blocks should be editable in the webview
 */

import { Node, mergeAttributes } from '@tiptap/core';

export interface RawBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rawBlock: {
      setRawBlock: (attributes: { content: string }) => ReturnType;
    };
  }
}

export const RawBlock = Node.create<RawBlockOptions>({
  name: 'rawBlock',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      content: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-content') || element.textContent || '',
        renderHTML: (attributes) => ({
          'data-content': attributes.content,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="raw-block"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const content = node.attrs.content as string;
    console.log('[RawBlock] Rendering RAW block', { contentLength: content.length });
    
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'raw-block',
        class: 'raw-block',
      }),
      [
        'pre',
        { class: 'raw-block-content' },
        content,
      ],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'raw-block');
      dom.className = 'raw-block';

      const label = document.createElement('span');
      label.className = 'raw-block-label';
      label.textContent = 'RAW';
      dom.appendChild(label);

      const textarea = document.createElement('textarea');
      textarea.className = 'raw-block-textarea';
      textarea.value = node.attrs.content as string;
      textarea.spellcheck = false;
      
      // Auto-resize textarea to fit content
      const autoResize = () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      };

      textarea.addEventListener('input', () => {
        autoResize();
        const pos = getPos();
        if (typeof pos === 'number') {
          console.log('[RawBlock] Content updated via textarea', { 
            contentLength: textarea.value.length,
            pos 
          });
          editor.chain().focus().command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { content: textarea.value });
            return true;
          }).run();
        }
      });

      dom.appendChild(textarea);

      // Initial resize after DOM is ready
      requestAnimationFrame(autoResize);

      console.log('[RawBlock] NodeView created (editable)', { 
        contentLength: (node.attrs.content as string).length 
      });

      return {
        dom,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'rawBlock') {
            return false;
          }
          if (textarea.value !== updatedNode.attrs.content) {
            textarea.value = updatedNode.attrs.content as string;
            autoResize();
          }
          return true;
        },
        selectNode: () => {
          textarea.focus();
        },
      };
    };
  },

  addCommands() {
    return {
      setRawBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});

export default RawBlock;
