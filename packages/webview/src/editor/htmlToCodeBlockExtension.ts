/**
 * HtmlToCodeBlock extension
 *
 * 役割: Markdown の HTML ブロックを不明ブロックとして扱う
 * 方針: HTML レンダリングは行わず、未解析ブロックとしてそのまま保持する
 * 不変条件: HTML ブロックの内容はそのまま rawBlock に移す
 */

import { Extension } from '@tiptap/core';
import type { MarkdownToken, MarkdownParseHelpers } from '@tiptap/core';
import { createLogger } from '../logger.js';

const log = createLogger('HtmlToCodeBlock');

export const HtmlToCodeBlock = Extension.create({
  name: 'htmlToCodeBlock',

  markdownTokenName: 'html',
  parseMarkdown: (token: MarkdownToken, _helpers: MarkdownParseHelpers) => {
    const raw = token.raw ?? token.text ?? '';
    const isBlock = (token as MarkdownToken & { block?: boolean }).block !== false;
    log.debug('parseMarkdown html', {
      block: isBlock,
      contentLength: raw.length,
    });
    if (!raw.trim()) {
      return null;
    }

    // inline HTML を block ノード化すると paragraph 配下に block が混入し、
    // schema 不整合（Invalid content for node doc）を引き起こす。
    if (!isBlock) {
      return {
        type: 'text',
        text: raw,
      };
    }

    return {
      type: 'rawBlock',
      attrs: {
        kind: 'html',
      },
      content: raw ? [{ type: 'text', text: raw }] : [],
    };
  },
});

export default HtmlToCodeBlock;
