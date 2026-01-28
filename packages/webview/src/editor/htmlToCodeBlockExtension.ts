/**
 * HtmlToCodeBlock extension
 *
 * 役割: Markdown の HTML ブロックを code block として扱う
 * 方針: HTML レンダリングは行わず、ハイライト対象のコードとして表示する
 * 不変条件: HTML ブロックの内容はそのまま code block に移す
 */

import { Extension } from '@tiptap/core';
import type { MarkdownToken, MarkdownParseHelpers } from '@tiptap/core';

export const HtmlToCodeBlock = Extension.create({
  name: 'htmlToCodeBlock',

  markdownTokenName: 'html',

  parseMarkdown: (token: MarkdownToken, _helpers: MarkdownParseHelpers) => {
    const raw = (token.raw ?? token.text ?? '').trimEnd();
    if (!raw.trim()) {
      return null;
    }

    return {
      type: 'codeBlock',
      attrs: {
        language: 'html',
      },
      content: [{ type: 'text', text: raw }],
    };
  },
});

export default HtmlToCodeBlock;
