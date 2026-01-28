/**
 * 役割: RAW ブロック用の Tiptap 拡張機能
 * 責務: :::raw 記法を編集可能なブロックとしてレンダリング
 * 不変条件: RAW ブロックは内容を正確に保持し、シリアライズ時にそのまま出力すること
 * 注意: 設計書 12.3.4 に従い、RAW ブロックは Webview 内で編集可能であること
 *
 * 設計書参照: 12.3.4 (RAW ブロック)
 *
 * RAW ブロックの用途:
 * - :::raw ブロック (Markdown で未対応の記法保持)
 *
 * 実装詳細:
 * - NodeView を使用して編集可能な contentDOM を提供
 * - ProseMirror に編集を委ね、atom/textarea 方式を廃止
 * - RAW 内容はノードの text content として保持
 *
 * データ例:
 * content: "---\ntitle: Test\ndate: 2026-01-06\n---"
 *
 * シリアライズ:
 * - @tiptap/markdown の renderMarkdown で node.textContent をそのまま出力
 * - 整形や変換は行わない（G5-lite 方針）
 *
 * @tiptap/markdown 統合:
 * - markdownTokenizer: :::raw を検出
 * - parseMarkdown: トークンを rawBlock ノードに変換
 * - renderMarkdown: attrs.content をそのまま出力
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { MarkdownToken, MarkdownParseHelpers } from '@tiptap/core';
import { applyIndentAttributesToDom, indentAttribute, normalizeIndentAttr, renderIndentMarker } from './indentConfig.js';
import { icons } from './icons.js';
import { createDragHandleElement, shouldRenderBlockHandle } from './blockHandlesExtension.js';
const RAW_BLOCK_RE = /^:::raw\s*\n([\s\S]*?)\n:::(?:\r?\n|$)/;

const normalizeRawContent = (content: string): string => {
  return content.endsWith('\n') ? content : `${content}\n`;
};

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
      kind: {
        default: 'raw',
        parseHTML: (element) => element.getAttribute('data-kind') || 'raw',
        renderHTML: (attributes) => ({
          'data-kind': attributes.kind || 'raw',
        }),
      },
      indent: indentAttribute,
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
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'raw-block',
        class: 'raw-block',
        'data-kind': node.attrs?.kind || 'raw',
      }),
      ['div', { class: 'block-content' }, ['pre', { class: 'raw-block-content' }, 0]],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'raw-block');
      dom.className = 'raw-block';
      dom.dataset.kind = String(node.attrs?.kind || 'raw');
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
          handle.dataset.blockType = 'rawBlock';
        } else {
          delete handle.dataset.blockPos;
        }
      };

      const syncHandleState = (updatedNode: typeof node) => {
        const shouldShowHandle = shouldRenderBlockHandle(editor.state, getPos, 'rawBlock');
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

      // Create label with info button
      const label = document.createElement('span');
      label.className = 'block-label';
      label.setAttribute('contenteditable', 'false');

      const labelText = document.createElement('span');
      labelText.textContent = 'RAW';
      label.appendChild(labelText);

      const infoBtn = document.createElement('span');
      infoBtn.className = 'block-label-info';
      infoBtn.innerHTML = icons.info;
      infoBtn.setAttribute('data-tooltip', 'Markdownとして解析できなかった部分です');
      label.appendChild(infoBtn);

      contentWrapper.appendChild(label);

      const contentDom = document.createElement('pre');
      contentDom.className = 'raw-block-content';
      contentDom.spellcheck = false;
      contentWrapper.appendChild(contentDom);
      let latestNode = node;

      console.log('[RawBlock] NodeView created (contentDOM)', { 
        kind: node.attrs?.kind ?? 'raw',
        contentLength: node.textContent.length,
      });

      return {
        dom,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'rawBlock') {
            return false;
          }
          latestNode = updatedNode;
          dom.dataset.kind = String(updatedNode.attrs?.kind || 'raw');
          syncHandleState(updatedNode);
          console.log('[RawBlock] NodeView update', {
            contentLength: updatedNode.textContent.length,
            kind: updatedNode.attrs?.kind ?? 'raw',
            pos: resolvePos(),
          });
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
        destroy: () => {
          console.log('[RawBlock] NodeView destroyed', {
            lastContentLength: latestNode.textContent.length,
            kind: latestNode.attrs?.kind ?? 'raw',
          });
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

  // @tiptap/markdown integration for RAW blocks
  markdownTokenizer: {
    name: 'rawBlock',
    level: 'block' as const,
    start: (src: string) => {
      return src.indexOf(':::raw');
    },
    tokenize: (src: string) => {
      const rawMatch = RAW_BLOCK_RE.exec(src);
      if (!rawMatch) {
        return undefined;
      }
      return {
        type: 'rawBlock',
        raw: rawMatch[0],
        text: rawMatch[1] ?? '',
        kind: 'raw',
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, _helpers: MarkdownParseHelpers) => {
    const kind = (token as MarkdownToken & { kind?: string }).kind ?? 'raw';
    const content = (token as MarkdownToken & { text?: string }).text ?? '';
    const normalized = content.trimEnd();
    console.log('[RawBlock] parseMarkdown raw block', { kind, contentLength: normalized.length });
    return _helpers.createNode(
      'rawBlock',
      { kind },
      normalized ? [_helpers.createTextNode(normalized)] : []
    );
  },

  renderMarkdown: (
    node: { attrs?: { indent?: number; kind?: string }; content?: unknown },
    _helpers: { renderChildren?: (content: unknown) => string },
    context?: { parentType?: { name?: string } }
  ) => {
    const kind = node.attrs?.kind ?? 'raw';
    const renderChildren = _helpers?.renderChildren;
    const content = renderChildren ? renderChildren(node.content ?? '') : '';
    const trimmed = content.trimEnd();
    console.log('[RawBlock] renderMarkdown', { contentLength: trimmed.length, kind });
    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);

    const rawBlock = normalizeRawContent(trimmed);
    return `${marker}:::raw\n${rawBlock}:::`;
  },
});

export default RawBlock;
