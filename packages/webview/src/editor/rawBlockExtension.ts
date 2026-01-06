/**
 * 役割: RAW ブロック用の Tiptap 拡張機能
 * 責務: 未対応の Markdown 記法（frontmatter 等）を編集可能なブロックとしてレンダリング
 * 不変条件: RAW ブロックは内容を正確に保持し、シリアライズ時にそのまま出力すること
 * 注意: 設計書 12.3.4 に従い、RAW ブロックは Webview 内で編集可能であること
 * 
 * 設計書参照: 12.3.4 (RAW ブロック)
 * 
 * RAW ブロックの用途:
 * - frontmatter (---...---): YAML メタデータ
 * - 未対応の Markdown 記法
 * - 特殊なコードブロック
 * 
 * 実装詳細:
 * - NodeView を使用して編集可能な textarea をレンダリング
 * - atom: true で Tiptap の通常編集から分離
 * - textarea の input イベントで attrs.content を更新
 * - autoResize で textarea の高さを内容に合わせて自動調整
 * 
 * データ例:
 * attrs: { content: "---\ntitle: Test\ndate: 2026-01-06\n---" }
 * 
 * シリアライズ:
 * - markdownCodec.ts の serializeNode で attrs.content をそのまま出力
 * - 整形や変換は行わない（G5-lite 方針）
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
