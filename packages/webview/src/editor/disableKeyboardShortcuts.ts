/**
 * Tiptapビルトインショートカットを無効化する拡張
 *
 * VSCodeのkeybindingsで全てのショートカットを管理するため、
 * Tiptap側のビルトインショートカットを無効化する。
 *
 * 各拡張をextendしてaddKeyboardShortcutsを空にオーバーライド
 */

import { mergeAttributes } from '@tiptap/core';
import type { MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import Underline from '@tiptap/extension-underline';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import History from '@tiptap/extension-history';
import { applyIndentAttributesToDom, indentAttribute, normalizeIndentAttr, renderIndentMarker } from './indentConfig.js';
import { createDragHandleElement, resolveBlockHandleEligibility } from './blockHandlesExtension.js';
import { BlockPreviewController } from './blockPreview.js';
import { createLogger } from '../logger.js';

const CODE_BLOCK_FENCE_RE = /^(```|~~~)([^\n]*)\n/;
const CODE_BLOCK_FILENAME_RE = /filename\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i;

const MODULE = 'BlockNodeView';
const log = createLogger(MODULE);

const logInfo = (msg: string, data?: Record<string, unknown>): void => {
  log.info(msg, data);
};

const logSuccess = (msg: string, data?: Record<string, unknown>): void => {
  log.success(msg, data);
};

const logWarning = (msg: string, data?: Record<string, unknown>): void => {
  log.warn(msg, data);
};

const createStaticHandleContainer = (): HTMLElement => {
  const container = createDragHandleElement();
  container.dataset.blockSource = 'nodeview';
  container.setAttribute('contenteditable', 'false');
  container.setAttribute('aria-hidden', 'true');
  container.draggable = false;
  return container;
};

const syncStaticHandleContainer = (
  host: HTMLElement,
  handleContainer: HTMLElement,
  decision: ReturnType<typeof resolveBlockHandleEligibility>,
  nodeType: string,
  handleLogger: ReturnType<typeof createHandleDecisionLogger>
): boolean => {
  const nextPos = decision.allowed && decision.pos !== null ? decision.pos : null;
  const hadHostClass = host.classList.contains('block-handle-host');

  handleLogger.logDecision('sync', decision, nextPos !== null);
  handleLogger.logHandlePos(nextPos, nextPos !== null);

  if (nextPos === null) {
    host.classList.remove('block-handle-host');
    handleContainer.setAttribute('aria-hidden', 'true');
    delete handleContainer.dataset.blockPos;
    delete handleContainer.dataset.blockType;
    if (hadHostClass) {
      handleLogger.logHandleState('removed', null, decision.reason);
    }
    return false;
  }

  host.classList.add('block-handle-host');
  handleContainer.dataset.blockPos = String(nextPos);
  handleContainer.dataset.blockType = nodeType;
  handleContainer.setAttribute('aria-hidden', 'false');
  if (!hadHostClass) {
    handleLogger.logHandleState('created', nextPos);
  }
  return true;
};

const createHandleDecisionLogger = (nodeType: string) => {
  let lastDecisionKey = '';
  let lastPos: number | null = null;

  const logDecision = (
    phase: string,
    decision: ReturnType<typeof resolveBlockHandleEligibility>,
    handleExists: boolean
  ) => {
    const key = `${decision.allowed}:${decision.reason}:${decision.pos ?? 'null'}`;
    if (key === lastDecisionKey) {
      return;
    }
    lastDecisionKey = key;
      const payload = {
        nodeType,
        phase,
        handleExists,
        allowed: decision.allowed,
        reason: decision.reason,
        pos: decision.pos,
        selfType: decision.selfType ?? null,
        inListItem: decision.inListItem ?? false,
        inTableCell: decision.inTableCell ?? false,
        inBlockquote: decision.inBlockquote ?? false,
        error: decision.error ?? null,
      };
    if (decision.allowed) {
      logInfo('Handle eligible', payload);
    } else {
      const expectedIneligible =
        decision.reason === 'in-list' ||
        decision.reason === 'in-table' ||
        decision.reason === 'in-blockquote';
      if (expectedIneligible) {
        logInfo('Handle ineligible', payload);
      } else {
        logWarning('Handle ineligible', payload);
      }
    }
  };

  const logHandlePos = (pos: number | null, handleExists: boolean) => {
    if (!handleExists) {
      lastPos = pos ?? null;
      return;
    }
    if (pos === null) {
      if (lastPos !== null) {
        logWarning('Handle position missing', { nodeType, lastPos });
      }
      lastPos = null;
      return;
    }
    if (lastPos !== pos) {
      logInfo('Handle position synced', { nodeType, pos });
    }
    lastPos = pos;
  };

  const logHandleState = (action: 'created' | 'removed', pos: number | null, reason?: string) => {
    if (action === 'created') {
      logSuccess('Handle created', { nodeType, pos });
      return;
    }
    logInfo('Handle removed', { nodeType, pos, reason: reason ?? null });
  };

  return { logDecision, logHandlePos, logHandleState };
};

const parseCodeBlockInfo = (token: MarkdownToken): { language: string | null; filename: string | null } => {
  if (token.codeBlockStyle === 'indented') {
    return { language: null, filename: null };
  }

  const raw = typeof token.raw === 'string' ? token.raw : '';
  const fenceMatch = CODE_BLOCK_FENCE_RE.exec(raw);
  const info = fenceMatch ? fenceMatch[2].trim() : (typeof token.lang === 'string' ? token.lang.trim() : '');

  if (!info) {
    return { language: typeof token.lang === 'string' ? token.lang.trim() || null : null, filename: null };
  }

  const primaryToken = info.split(/\s+/)[0] || '';
  if (primaryToken.includes(':') && !CODE_BLOCK_FILENAME_RE.test(info)) {
    const colonIndex = primaryToken.indexOf(':');
    const langPart = primaryToken.slice(0, colonIndex).trim();
    const filePart = primaryToken.slice(colonIndex + 1).trim();
    return {
      language: langPart || null,
      filename: filePart || null,
    };
  }

  const filenameMatch = CODE_BLOCK_FILENAME_RE.exec(info);
  const filename = filenameMatch ? (filenameMatch[1] || filenameMatch[2] || filenameMatch[3] || '').trim() : null;
  const infoWithoutFilename = filenameMatch ? info.replace(filenameMatch[0], '').trim() : info;
  const language = infoWithoutFilename.split(/\s+/)[0] || null;

  return {
    language: language || (typeof token.lang === 'string' ? token.lang.trim() || null : null),
    filename: filename || null,
  };
};

const buildCodeBlockInfo = (language: string | null, filename: string | null): string => {
  if (language && filename) {
    return `${language}:${filename}`;
  }
  if (filename) {
    return `:${filename}`;
  }
  return language ?? '';
};

const buildCodeBlockLabelNodes = (language: string | null, filename: string | null): (string | unknown[])[] => {
  const text =
    language && filename ? `${language}:${filename}` : filename ? `:${filename}` : language ? language : '';
  return text ? [text] : [];
};

/**
 * Bold拡張 (Mod-b 無効化)
 */
export const BoldNoShortcut = Bold.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Italic拡張 (Mod-i 無効化)
 */
export const ItalicNoShortcut = Italic.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Strike拡張 (Mod-Shift-s 無効化)
 */
export const StrikeNoShortcut = Strike.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Code拡張 (Mod-e 無効化)
 */
export const CodeNoShortcut = Code.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Paragraph拡張 (Mod-Alt-0 無効化 + indent対応)
 */
export const ParagraphNoShortcut = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens || [];
    // Image.inline=true 構成では、画像単独段落をアンラップすると
    // doc 直下に inline image が出て schema 不整合になる。
    return helpers.createNode('paragraph', undefined, helpers.parseInline(tokens));
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('p');
      const handleContainer = createStaticHandleContainer();
      dom.appendChild(handleContainer);

      const contentDom = document.createElement('span');
      contentDom.className = 'block-content';
      dom.appendChild(contentDom);
      const handleLogger = createHandleDecisionLogger('paragraph');

      const syncIndent = (updatedNode: typeof node) => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'paragraph');
        const shouldShowHandle = syncStaticHandleContainer(dom, handleContainer, eligibility, 'paragraph', handleLogger);
        applyIndentAttributesToDom(dom, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      syncIndent(node);

      return {
        dom,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'paragraph') {
            return false;
          }
          syncIndent(updatedNode);
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return false;
        },
      };
    };
  },
  renderMarkdown: (node, h, context) => {
    if (!node || !Array.isArray(node.content)) {
      return '';
    }
    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    const content = h.renderChildren(node.content);
    return `${marker}${content}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Underline拡張 (Mod-u 無効化)
 */
export const UnderlineNoShortcut = Underline.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Heading拡張 (Mod-Alt-1~6 無効化)
 */
export const HeadingNoShortcut = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const level = node.attrs?.level ? Number.parseInt(String(node.attrs.level), 10) : 1;
      const tagName = `h${Math.min(6, Math.max(1, level))}`;
      const dom = document.createElement(tagName);
      const handleContainer = createStaticHandleContainer();
      dom.appendChild(handleContainer);

      const contentDom = document.createElement('span');
      contentDom.className = 'block-content';
      dom.appendChild(contentDom);
      const handleLogger = createHandleDecisionLogger('heading');

      const syncIndent = (updatedNode: typeof node) => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'heading');
        const shouldShowHandle = syncStaticHandleContainer(dom, handleContainer, eligibility, 'heading', handleLogger);
        applyIndentAttributesToDom(dom, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      syncIndent(node);

      return {
        dom,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'heading') {
            return false;
          }
          const nextLevel = updatedNode.attrs?.level ? Number.parseInt(String(updatedNode.attrs.level), 10) : 1;
          if (nextLevel !== level) {
            return false;
          }
          syncIndent(updatedNode);
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return false;
        },
      };
    };
  },
  renderMarkdown: (node, h, context) => {
    const level = node.attrs?.level ? Number.parseInt(String(node.attrs.level), 10) : 1;
    const headingChars = '#'.repeat(level);

    if (!node.content) {
      return '';
    }

    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    const content = `${headingChars} ${h.renderChildren(node.content)}`;
    return `${marker}${content}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * BulletList拡張 (Mod-Shift-8 無効化)
 */
export const BulletListNoShortcut = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  renderMarkdown: (node, h, context) => {
    if (!node.content) {
      return '';
    }
    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    const content = h.renderChildren(node.content, '\n');
    return `${marker}${content}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * OrderedList拡張 (Mod-Shift-7 無効化)
 */
export const OrderedListNoShortcut = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  renderMarkdown: (node, h, context) => {
    if (!node.content) {
      return '';
    }
    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    const content = h.renderChildren(node.content, '\n');
    return `${marker}${content}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * ListItem拡張 (Tab/Shift-Tab 無効化)
 */
export const ListItemNoShortcut = ListItem.extend({
  // Allow plainTextBlock as the first child for per-item plain text editing.
  content: '(paragraph | plainTextBlock) block*',
  addNodeView() {
    return ({ getPos, editor }) => {
      const dom = document.createElement('li');
      const handleContainer = createStaticHandleContainer();
      dom.appendChild(handleContainer);

      const contentDom = document.createElement('div');
      contentDom.className = 'block-content';
      dom.appendChild(contentDom);
      const handleLogger = createHandleDecisionLogger('listItem');

      const syncHandleState = () => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'listItem');
        syncStaticHandleContainer(dom, handleContainer, eligibility, 'listItem', handleLogger);
      };

      syncHandleState();

      return {
        dom,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'listItem') {
            return false;
          }
          syncHandleState();
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return false;
        },
      };
    };
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Blockquote拡張 (Mod-Shift-b 無効化)
 */
export const BlockquoteNoShortcut = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'blockquote-block';
      const handleContainer = createStaticHandleContainer();
      wrapper.appendChild(handleContainer);

      const dom = document.createElement('blockquote');

      const contentDom = document.createElement('div');
      contentDom.className = 'block-content';
      dom.appendChild(contentDom);
      wrapper.appendChild(dom);
      const handleLogger = createHandleDecisionLogger('blockquote');

      const syncIndent = (updatedNode: typeof node) => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'blockquote');
        const shouldShowHandle = syncStaticHandleContainer(wrapper, handleContainer, eligibility, 'blockquote', handleLogger);
        applyIndentAttributesToDom(wrapper, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      syncIndent(node);

      return {
        dom: wrapper,
        contentDOM: contentDom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'blockquote') {
            return false;
          }
          syncIndent(updatedNode);
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return false;
        },
      };
    };
  },
  renderMarkdown: (node, h, context) => {
    if (!node.content) {
      return '';
    }

    const prefix = '>';
    const result: string[] = [];

    node.content.forEach(child => {
      const childContent = h.renderChildren([child]);
      const lines = childContent.split('\n');
      const linesWithPrefix = lines.map(line => {
        if (line.trim() === '') {
          return prefix;
        }
        return `${prefix} ${line}`;
      });
      result.push(linesWithPrefix.join('\n'));
    });

    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    const content = result.join(`\n${prefix}\n`);
    return `${marker}${content}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * CodeBlock拡張 (Mod-Alt-c 無効化)
 */
export const CodeBlockNoShortcut = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
      filename: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-filename'),
        renderHTML: (attributes) => {
          if (!attributes.filename) {
            return {};
          }
          return {
            'data-filename': attributes.filename,
          };
        },
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const language = node.attrs?.language ? String(node.attrs.language) : '';
    const filename = node.attrs?.filename ? String(node.attrs.filename) : '';
    const labelNodes = buildCodeBlockLabelNodes(language || null, filename || null);
    const hasLabel = labelNodes.length > 0;
    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      class: 'code-block block-handle-host',
      ...(language ? { 'data-language': language } : {}),
      ...(filename ? { 'data-filename': filename } : {}),
      ...(hasLabel ? { 'data-has-label': 'true' } : {}),
    });

    return [
      'pre',
      attrs,
      ...(hasLabel
        ? [
            [
              'span',
              {
                class: 'block-label code-block-label',
                contenteditable: 'false',
              },
              ...labelNodes,
            ],
          ]
        : []),
      [
        'code',
        {
          class: language ? this.options.languageClassPrefix + language : null,
        },
        0,
      ],
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'code-block-wrapper';
      dom.setAttribute('data-type', 'code-block');
      const handleContainer = createStaticHandleContainer();
      dom.appendChild(handleContainer);

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      const pre = document.createElement('pre');
      pre.className = 'code-block';
      contentWrapper.appendChild(pre);

      const label = document.createElement('span');
      label.className = 'block-label code-block-label';
      label.setAttribute('contenteditable', 'true');
      label.setAttribute('spellcheck', 'false');
      label.dataset.placeholder = 'language:filename';
      pre.appendChild(label);

      const code = document.createElement('code');
      pre.appendChild(code);
      const handleLogger = createHandleDecisionLogger('codeBlock');

      const syncIndent = (updatedNode: typeof node) => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'codeBlock');
        const shouldShowHandle = syncStaticHandleContainer(dom, handleContainer, eligibility, 'codeBlock', handleLogger);
        applyIndentAttributesToDom(dom, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      let currentNode = node;
      let isEditingLabel = false;
      let languageClass: string | null = null;
      const isMermaidLanguage = (candidate: typeof node): boolean => {
        const languageAttr = candidate.attrs?.language ? String(candidate.attrs.language) : '';
        return languageAttr.trim().toLowerCase() === 'mermaid';
      };

      const preview = new BlockPreviewController({
        renderer: 'mermaid',
        host: pre,
        contentDom: code,
        getSource: () => currentNode.textContent,
        padded: false,
        initialAvailable: isMermaidLanguage(node),
      });

      const buildLabelText = (language: string | null, filename: string | null): string => {
        if (language && filename) {
          return `${language}:${filename}`;
        }
        if (filename) {
          return `:${filename}`;
        }
        return language ?? '';
      };

      const parseLabelText = (value: string): { language: string | null; filename: string | null } => {
        const trimmed = value.trim();
        if (!trimmed) {
          return { language: null, filename: null };
        }
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) {
          return { language: trimmed, filename: null };
        }
        const language = trimmed.slice(0, colonIndex).trim();
        const filename = trimmed.slice(colonIndex + 1).trim();
        return { language: language || null, filename: filename || null };
      };

      const applyLabelChange = () => {
        const pos = resolvePos();
        if (pos === null) {
          return;
        }
        const text = (label.textContent ?? '').replace(/\u200b/g, '').trim();
        const parsed = parseLabelText(text);
        const nextAttrs = {
          ...currentNode.attrs,
          language: parsed.language,
          filename: parsed.filename,
        };
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, nextAttrs));
      };

      const updateLabel = (language: string | null, filename: string | null) => {
        if (isEditingLabel) {
          return true;
        }
        const text = buildLabelText(language, filename);
        label.textContent = text;
        label.classList.toggle('is-empty', !text);
        return true;
      };

      const syncAttrs = (updatedNode: typeof node) => {
        const language = updatedNode.attrs?.language ? String(updatedNode.attrs.language) : '';
        const filename = updatedNode.attrs?.filename ? String(updatedNode.attrs.filename) : '';
        const hasLabel = updateLabel(language || null, filename || null);
        if (language) {
          pre.setAttribute('data-language', language);
        } else {
          pre.removeAttribute('data-language');
        }
        if (filename) {
          pre.setAttribute('data-filename', filename);
        } else {
          pre.removeAttribute('data-filename');
        }
        if (hasLabel) {
          pre.setAttribute('data-has-label', 'true');
        } else {
          pre.removeAttribute('data-has-label');
        }
        const prefix = this.options.languageClassPrefix ?? 'language-';
        if (languageClass) {
          code.classList.remove(languageClass);
          languageClass = null;
        }
        if (language) {
          languageClass = `${prefix}${language}`;
          code.classList.add(languageClass);
        }
      };

      const onLabelFocus = () => {
        isEditingLabel = true;
      };
      const onLabelBlur = () => {
        if (!isEditingLabel) {
          return;
        }
        isEditingLabel = false;
        applyLabelChange();
        if (!label.textContent?.trim()) {
          label.textContent = '';
          label.classList.add('is-empty');
        }
      };
      const onLabelKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          label.blur();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          const language = currentNode.attrs?.language ? String(currentNode.attrs.language) : '';
          const filename = currentNode.attrs?.filename ? String(currentNode.attrs.filename) : '';
          label.textContent = buildLabelText(language || null, filename || null);
          label.classList.toggle('is-empty', !label.textContent);
          label.blur();
        }
      };

      label.addEventListener('focus', onLabelFocus);
      label.addEventListener('blur', onLabelBlur);
      label.addEventListener('keydown', onLabelKeyDown);

      syncIndent(node);
      syncAttrs(node);

      return {
        dom,
        contentDOM: code,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'codeBlock') {
            return false;
          }
          currentNode = updatedNode;
          syncIndent(updatedNode);
          syncAttrs(updatedNode);
          preview.setAvailable(isMermaidLanguage(updatedNode));
          preview.notifySourceChanged();
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return label.contains(event.target) || preview.getToolbarElement().contains(event.target);
        },
        ignoreMutation: (mutation) => {
          if (mutation.type === 'selection') {
            return false;
          }
          const target = mutation.target as Node;
          if (target === code && mutation.type === 'attributes') {
            return true;
          }
          return !code.contains(target);
        },
        destroy: () => {
          preview.destroy();
          label.removeEventListener('focus', onLabelFocus);
          label.removeEventListener('blur', onLabelBlur);
          label.removeEventListener('keydown', onLabelKeyDown);
        },
      };
    };
  },
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    const raw = typeof token.raw === 'string' ? token.raw : '';
    const isFence = raw.startsWith('```') || raw.startsWith('~~~');
    if (!isFence && token.codeBlockStyle !== 'indented') {
      return [];
    }

    const { language, filename } = parseCodeBlockInfo(token);

    return helpers.createNode(
      'codeBlock',
      { language: language || null, filename: filename || null },
      token.text ? [helpers.createTextNode(token.text)] : [],
    );
  },
  renderMarkdown: (node, h, context) => {
    let output = '';
    const language = node.attrs?.language ? String(node.attrs.language) : '';
    const filename = node.attrs?.filename ? String(node.attrs.filename) : '';
    const info = buildCodeBlockInfo(language || null, filename || null);
    const fence = info ? `\`\`\`${info}` : '```';

    if (!node.content) {
      output = `${fence}\n\n\`\`\``;
    } else {
      const lines = [fence, h.renderChildren(node.content), '```'];
      output = lines.join('\n');
    }

    const indent = normalizeIndentAttr(node.attrs?.indent);
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    return `${marker}${output}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * HorizontalRule拡張 (Mod-Shift-- 無効化 + indent対応)
 */
export const HorizontalRuleNoShortcut = HorizontalRule.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'horizontal-rule-block';
      wrapper.setAttribute('data-type', 'horizontal-rule');
      wrapper.contentEditable = 'false';
      const handleContainer = createStaticHandleContainer();
      wrapper.appendChild(handleContainer);
      const handleLogger = createHandleDecisionLogger('horizontalRule');

      const syncIndent = (updatedNode: typeof node) => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'horizontalRule');
        const shouldShowHandle = syncStaticHandleContainer(wrapper, handleContainer, eligibility, 'horizontalRule', handleLogger);
        applyIndentAttributesToDom(wrapper, shouldShowHandle ? updatedNode.attrs?.indent : 0);
      };

      syncIndent(node);

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';

      const hr = document.createElement('hr');
      hr.className = 'horizontal-rule-line';
      contentWrapper.appendChild(hr);

      wrapper.appendChild(contentWrapper);

      return {
        dom: wrapper,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'horizontalRule') {
            return false;
          }
          syncIndent(updatedNode);
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return false;
        },
      };
    };
  },
  renderMarkdown: (node, _h, context) => {
    const indent = normalizeIndentAttr(node.attrs?.indent);
    const content = '---';
    const isInListItem = context?.parentType?.name === 'listItem';
    const marker = isInListItem ? '' : renderIndentMarker(indent);
    return `${marker}${content}`;
  },
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * History拡張 (Mod-z, Mod-Shift-z 無効化)
 */
export const HistoryNoShortcut = History.extend({
  addKeyboardShortcuts() {
    return {};
  },
});
