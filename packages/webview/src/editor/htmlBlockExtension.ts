/**
 * Role: Tiptap extension for HTML blocks
 * Responsibility: Render sanitized HTML content when security.renderHtml=true
 * Invariant: Original HTML is preserved in attrs.content, sanitization happens at render time only
 * Note: Per spec 12.3.1, HTML should be sanitized at render time, not stored sanitized
 */

import { Node, mergeAttributes } from '@tiptap/core';
import DOMPurify from 'dompurify';

// DOMPurify configuration for safe HTML rendering (same as in markdownCodec)
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'sup', 'sub', 'del', 's', 'mark'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

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
        0,
      ],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'html-block');
      dom.className = 'html-block';
      dom.contentEditable = 'false';

      const label = document.createElement('span');
      label.className = 'html-block-label';
      label.textContent = 'HTML';
      dom.appendChild(label);

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'html-block-content';
      
      // IMPORTANT: Sanitize at render time, not at parse time
      // This preserves original HTML in attrs.content for serialization
      const originalHtml = node.attrs.content as string;
      const sanitizedHtml = DOMPurify.sanitize(originalHtml, DOMPURIFY_CONFIG);
      contentWrapper.innerHTML = sanitizedHtml;
      
      console.log('[HtmlBlock] NodeView created with render-time sanitization', { 
        originalLength: originalHtml.length,
        sanitizedLength: sanitizedHtml.length 
      });
      
      dom.appendChild(contentWrapper);

      return {
        dom,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'htmlBlock') {
            return false;
          }
          // Re-sanitize on every update for security
          const updatedHtml = updatedNode.attrs.content as string;
          const sanitized = DOMPurify.sanitize(updatedHtml, DOMPURIFY_CONFIG);
          contentWrapper.innerHTML = sanitized;
          console.log('[HtmlBlock] NodeView updated with re-sanitization', {
            originalLength: updatedHtml.length,
            sanitizedLength: sanitized.length
          });
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
