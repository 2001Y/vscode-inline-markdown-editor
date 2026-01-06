/**
 * Role: Tiptap extension for HTML blocks
 * Responsibility: Render sanitized HTML content when security.renderHtml=true
 * Invariant: HTML blocks are sanitized with DOMPurify before rendering
 */

import { Node, mergeAttributes } from '@tiptap/core';

export interface HtmlBlockOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlBlock: {
      setHtmlBlock: (attributes: { content: string }) => ReturnType;
    };
  }
}

export const HtmlBlock = Node.create<HtmlBlockOptions>({
  name: 'htmlBlock',

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
        parseHTML: (element) => element.getAttribute('data-content') || element.innerHTML || '',
        renderHTML: (attributes) => ({
          'data-content': attributes.content,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="html-block"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const content = node.attrs.content as string;
    console.log('[HtmlBlock] Rendering HTML block', { contentLength: content.length });
    
    // Create a wrapper div with the sanitized HTML content
    // The content is already sanitized by DOMPurify in markdownCodec
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'html-block',
        class: 'html-block',
        contenteditable: 'false',
      }),
      [
        'div',
        { class: 'html-block-content' },
        // Note: innerHTML will be set via NodeView or DOM manipulation
        // For now, we render the sanitized HTML as text that will be parsed
        0, // This tells Tiptap to render the content
      ],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'html-block');
      dom.className = 'html-block';
      dom.contentEditable = 'false';

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'html-block-content';
      // The content is already sanitized by DOMPurify in markdownCodec
      contentWrapper.innerHTML = node.attrs.content as string;
      
      dom.appendChild(contentWrapper);

      console.log('[HtmlBlock] NodeView created', { contentLength: (node.attrs.content as string).length });

      return {
        dom,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'htmlBlock') {
            return false;
          }
          contentWrapper.innerHTML = updatedNode.attrs.content as string;
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      setHtmlBlock:
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

export default HtmlBlock;
