/**
 * Indent Marker Extension
 *
 * 役割: コメントマーカー `<!-- inlineMark:indent=N -->` を次のブロックに適用する
 * 責務: Markdownトークナイズと indent 属性付与
 * 不変条件: marker は次のブロック1件だけに適用する。失敗は ERROR ログ。
 */

import { Extension } from '@tiptap/core';
import type { MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';
import { clampIndentLevel, normalizeIndentAttr } from './indentConfig.js';
import { createLogger } from '../logger.js';

const MODULE = 'IndentMarker';
const log = createLogger(MODULE);

const START_RE = /^<!--\s*inlineMark:indent(?:=(\d+))?\s*-->\s*(?:\r?\n|$)/i;
const START_SEARCH_RE = /<!--\s*inlineMark:indent/i;

const logInfo = (msg: string, data?: Record<string, unknown>): void => {
  log.info(msg, data);
};

const logWarning = (msg: string, data?: Record<string, unknown>): void => {
  log.warn(msg, data);
};

const logError = (msg: string, data?: Record<string, unknown>): void => {
  log.error(msg, data);
};

const findFirstContentToken = (tokens: MarkdownToken[]): { token: MarkdownToken; raw: string } | null => {
  let raw = '';
  for (const token of tokens) {
    raw += token.raw ?? '';
    if (token.type !== 'space') {
      return { token, raw };
    }
  }
  return null;
};

const applyIndentToNode = (node: { attrs?: Record<string, unknown> }, indent: number): void => {
  const next = normalizeIndentAttr(indent);
  node.attrs = {
    ...(node.attrs ?? {}),
    indent: next,
  };
};

const resolveNodeTypeName = (node: unknown): string | null => {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const typeValue = (node as { type?: { name?: string } | string }).type;
  if (typeof typeValue === 'string') {
    return typeValue;
  }
  if (typeValue && typeof typeValue === 'object') {
    const name = (typeValue as { name?: string }).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
};

export const IndentMarker = Extension.create({
  name: 'indentMarker',

  markdownTokenName: 'inlineMarkIndent',

  markdownTokenizer: {
    name: 'inlineMarkIndent',
    level: 'block',
    start: (src: string) => src.search(START_SEARCH_RE),
    tokenize: (src: string, _tokens: MarkdownToken[], lexer: { blockTokens: (input: string) => MarkdownToken[] }) => {
      const startMatch = START_RE.exec(src);
      if (!startMatch) {
        return undefined;
      }

      const rawLevel = startMatch[1] ? Number.parseInt(startMatch[1], 10) : 1;
      if (!Number.isFinite(rawLevel)) {
        logError('Indent marker has invalid level', { raw: startMatch[0] });
        return undefined;
      }

      const startLength = startMatch[0].length;
      const remainder = src.slice(startLength);
      const tokens = lexer.blockTokens(remainder);
      const first = findFirstContentToken(tokens);

      if (!first) {
        logError('Indent marker has no following block', { preview: remainder.slice(0, 80) });
        return undefined;
      }

      const clamped = clampIndentLevel(rawLevel);
      if (clamped !== rawLevel) {
        logWarning('Indent marker level clamped', { requested: rawLevel, clamped });
      }

      return {
        type: 'inlineMarkIndent',
        raw: startMatch[0] + first.raw,
        indentLevel: clamped,
        tokens: [first.token],
      } as MarkdownToken;
    },
  },

  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    const indentLevel = clampIndentLevel(Number.parseInt(String(token.indentLevel ?? 1), 10));
    const content = helpers.parseChildren(token.tokens || []);

    if (!Array.isArray(content) || content.length === 0) {
      logError('Indent marker parse produced no content', { indentLevel });
      return [];
    }

    const [first, ...rest] = content;
    applyIndentToNode(first, indentLevel);

    if (rest.length > 0) {
      logWarning('Indent marker parsed multiple blocks; only first is indented', { count: content.length });
    }

    const nodeType = resolveNodeTypeName(first);
    logInfo('Indent marker applied', { indentLevel, nodeType });
    return [first, ...rest];
  },
});

export default IndentMarker;
