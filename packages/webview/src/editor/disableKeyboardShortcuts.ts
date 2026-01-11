/**
 * Tiptapビルトインショートカットを無効化する拡張
 *
 * VSCodeのkeybindingsで全てのショートカットを管理するため、
 * Tiptap側のビルトインショートカットを無効化する。
 *
 * 各拡張をextendしてaddKeyboardShortcutsを空にオーバーライド
 */

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
import CodeBlock from '@tiptap/extension-code-block';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import History from '@tiptap/extension-history';
import { indentAttribute, normalizeIndentAttr, renderIndentMarker } from './indentConfig.js';

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
export const CodeBlockNoShortcut = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: indentAttribute,
    };
  },
  renderMarkdown: (node, h, context) => {
    let output = '';
    const language = node.attrs?.language || '';

    if (!node.content) {
      output = `\`\`\`${language}\n\n\`\`\``;
    } else {
      const lines = [`\`\`\`${language}`, h.renderChildren(node.content), '```'];
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
