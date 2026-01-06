/**
 * 役割: HTML ブロック用の Tiptap 拡張機能
 * 責務: security.renderHtml=true の場合にサニタイズされた HTML をレンダリング
 * 不変条件: 元の HTML は attrs.content に保持、サニタイズはレンダリング時のみ
 * 注意: 設計書 12.3.1 に従い、HTML はレンダリング時にサニタイズ（保存時ではない）
 * 
 * 設計書参照: 12.3.1 (HTML サニタイズ)
 * 
 * セキュリティ方針:
 * - DOMPurify でサニタイズ
 * - 許可タグ: b, i, em, strong, a, p, br, ul, ol, li, code, pre, blockquote, h1-h6, hr, span, div, table, thead, tbody, tr, th, td, img, sup, sub, del, s, mark
 * - 許可属性: href, src, alt, title, class, id, target, rel
 * - data-* 属性は禁止 (ALLOW_DATA_ATTR: false)
 * 
 * 重要な設計決定:
 * - attrs.content には常に元の HTML を保存（サニタイズ済みを保存しない）
 * - NodeView の update でも毎回サニタイズ（セキュリティ確保）
 * - contentEditable: false で直接編集を防止
 * 
 * データ例:
 * attrs: { content: "<div class='note'>Hello <script>alert('xss')</script></div>" }
 * レンダリング結果: "<div class='note'>Hello </div>" (script タグは除去)
 * 
 * シリアライズ:
 * - markdownCodec.ts の serializeNode で attrs.content をそのまま出力
 * - サニタイズ済みではなく元の HTML を出力（ユーザーの意図を保持）
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
