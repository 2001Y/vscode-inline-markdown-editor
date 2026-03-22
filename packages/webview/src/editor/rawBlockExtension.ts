/**
 * 役割: 不明なブロック(未知構文)の保持用 Tiptap 拡張機能
 * 責務: :::... や HTML ブロックなど解析不能な領域をそのまま表示・保持する
 * 不変条件: 不明ブロックは内容を正確に保持し、シリアライズ時にそのまま出力すること
 * 注意: 設計書 12.3.4 に従い、RAW ブロックは Webview 内で編集可能であること
 *
 * 設計書参照: 12.3.4 (RAW ブロック)
 *
 * 不明ブロックの用途:
 * - :::... ブロック (Markdown で未対応の記法保持)
 * - HTML ブロック (Markdown 直書き HTML)
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
 * - @tiptap/markdown の renderMarkdown で raw 文字列をそのまま出力
 * - 整形や変換は行わない（G5-lite 方針）
 *
 * @tiptap/markdown 統合:
 * - markdownTokenizer: :::... を検出
 * - parseMarkdown: トークンを rawBlock ノードに変換
 * - renderMarkdown: attrs.content をそのまま出力
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { MarkdownToken, MarkdownParseHelpers } from '@tiptap/core';
import { applyIndentAttributesToDom, indentAttribute } from './indentConfig.js';
import { BlockPreviewController } from './blockPreview.js';
import { applyNodeViewHandleState, createNodeViewHandleContainer, resolveBlockHandleEligibility } from './blockHandlesExtension.js';
import { createLogger } from '../logger.js';
import { postToVsCode } from '../protocol/vscodeApi.js';
import { createOpenLinkMessage } from '../protocol/types.js';
const RAW_BLOCK_START_RE = /^:::(\S+)?\s*$/;
const log = createLogger('RawBlock');
const CUSTOM_BLOCK_GUIDE_URL =
  'https://github.com/2001Y/vscode-inline-markdown-editor#custom-inlinemark-block-extension-guide';
const getLabelTextForKind = (kind: string): string => {
  if (kind === 'html') {
    return '直書きHTML';
  }
  return '不明なブロック';
};

const collectRawText = (content: unknown): string => {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((child) => {
      if (!child || typeof child !== 'object') {
        return '';
      }
      const text = (child as { text?: string }).text;
      if (typeof text === 'string') {
        return text;
      }
      const nested = (child as { content?: unknown }).content;
      return collectRawText(nested);
    })
    .join('');
};

const parseRawBlockFromSource = (
  src: string
): { raw: string; kind: string } | null => {
  const lines = src.split(/\r?\n/);
  if (lines.length === 0) {
    return null;
  }
  const firstLine = lines[0]?.trimEnd() ?? '';
  const startMatch = RAW_BLOCK_START_RE.exec(firstLine);
  if (!startMatch) {
    return null;
  }
  const kind = startMatch[1] ?? 'raw';
  let depth = 0;
  let endIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith(':::')) {
      continue;
    }
    if (i === 0) {
      depth = 1;
      continue;
    }
    if (line === ':::') {
      depth -= 1;
      if (depth === 0) {
        endIndex = i;
        break;
      }
      continue;
    }
    depth += 1;
  }
  if (endIndex < 0) {
    log.error('RAW block parse failed: missing closing :::', {
      kind,
      startLine: firstLine,
      scannedLines: lines.length,
    });
    return null;
  }
  const raw = lines.slice(0, endIndex + 1).join('\n');
  return { raw, kind };
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
      const handleContainer = createNodeViewHandleContainer();
      dom.appendChild(handleContainer);

      const resolvePos = () => {
        const pos = getPos();
        return typeof pos === 'number' ? pos : null;
      };

      const syncHandleState = (updatedNode: typeof node) => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'rawBlock');
        const shouldShowHandle = applyNodeViewHandleState(dom, handleContainer, eligibility, 'rawBlock');
        applyIndentAttributesToDom(dom, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      syncHandleState(node);

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      // Create label with info button
      const label = document.createElement('span');
      label.className = 'block-label';
      label.setAttribute('contenteditable', 'false');

      const labelText = document.createElement('span');
      labelText.textContent = getLabelTextForKind(String(node.attrs?.kind ?? 'raw'));
      label.appendChild(labelText);

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'block-label-action';
      actionBtn.textContent = '→inlineMark拡張機能を作る';
      actionBtn.title = 'カスタムブロック拡張の作成ガイドを開く';
      actionBtn.setAttribute('contenteditable', 'false');
      const onActionClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        postToVsCode(createOpenLinkMessage(CUSTOM_BLOCK_GUIDE_URL));
      };
      actionBtn.addEventListener('click', onActionClick);
      label.appendChild(actionBtn);
      const syncActionVisibility = (kind: string) => {
        actionBtn.hidden = kind === 'html';
      };
      syncActionVisibility(String(node.attrs?.kind ?? 'raw'));

      contentWrapper.appendChild(label);

      const contentDom = document.createElement('pre');
      contentDom.className = 'raw-block-content';
      contentDom.spellcheck = false;
      contentWrapper.appendChild(contentDom);
      let latestNode = node;
      const preview = new BlockPreviewController({
        renderer: 'html',
        host: contentWrapper,
        contentDom,
        getSource: () => latestNode.textContent,
        padded: true,
        initialAvailable: String(node.attrs?.kind || 'raw') === 'html',
      });

      log.info('NodeView created (contentDOM)', { 
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
          labelText.textContent = getLabelTextForKind(String(updatedNode.attrs?.kind ?? 'raw'));
          syncActionVisibility(String(updatedNode.attrs?.kind ?? 'raw'));
          syncHandleState(updatedNode);
          preview.setAvailable(String(updatedNode.attrs?.kind || 'raw') === 'html');
          preview.notifySourceChanged();
          log.debug('NodeView update', {
            contentLength: updatedNode.textContent.length,
            kind: updatedNode.attrs?.kind ?? 'raw',
            pos: resolvePos(),
          });
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          if (label.contains(event.target)) {
            return true;
          }
          if (preview.getToolbarElement().contains(event.target)) {
            return true;
          }
          return false;
        },
        ignoreMutation: (mutation) => {
          if (mutation.type === 'selection') {
            return false;
          }
          const target = mutation.target as Node;
          if (target === contentDom && mutation.type === 'attributes') {
            return true;
          }
          return !contentDom.contains(target);
        },
        destroy: () => {
          preview.destroy();
          actionBtn.removeEventListener('click', onActionClick);
          log.info('NodeView destroyed', {
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
      return src.indexOf(':::');
    },
    tokenize: (src: string) => {
      const parsed = parseRawBlockFromSource(src);
      if (!parsed) {
        return undefined;
      }
      return {
        type: 'rawBlock',
        raw: parsed.raw,
        text: parsed.raw,
        kind: parsed.kind,
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, _helpers: MarkdownParseHelpers) => {
    const kind = (token as MarkdownToken & { kind?: string }).kind ?? 'raw';
    const raw =
      (token as MarkdownToken & { raw?: string }).raw ?? (token as MarkdownToken & { text?: string }).text ?? '';
    log.debug('parseMarkdown raw block', { kind, contentLength: raw.length });
    return _helpers.createNode(
      'rawBlock',
      { kind },
      raw ? [_helpers.createTextNode(raw)] : []
    );
  },

  renderMarkdown: (
    node: { attrs?: { indent?: number; kind?: string }; content?: unknown },
    _helpers: { renderChildren?: (content: unknown) => string },
    _context?: { parentType?: { name?: string } }
  ) => {
    const kind = node.attrs?.kind ?? 'raw';
    const raw = collectRawText(node.content ?? []);
    log.debug('renderMarkdown', { contentLength: raw.length, kind });
    return raw;
  },
});

export default RawBlock;
