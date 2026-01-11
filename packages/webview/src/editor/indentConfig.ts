/**
 * Indent configuration utilities
 *
 * 役割: indent レベルの正規化/レンダリング支援
 * 不変条件: indent は 0..10、コメントマーカーは 1..10
 */

export const INDENT_LEVEL_MIN = 1;
export const INDENT_LEVEL_MAX = 10;

export const clampIndentLevel = (value: number): number => {
  const next = Math.round(value);
  return Math.min(INDENT_LEVEL_MAX, Math.max(INDENT_LEVEL_MIN, next));
};

export const normalizeIndentAttr = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(INDENT_LEVEL_MAX, Math.max(0, parsed));
};

export const renderIndentMarker = (indent: number): string => {
  const level = normalizeIndentAttr(indent);
  if (level <= 0) {
    return '';
  }
  return `<!-- inlineMark:indent=${level} -->\n`;
};

export const renderIndentAttributes = (indent: number): Record<string, string> => {
  const level = normalizeIndentAttr(indent);
  if (level <= 0) {
    return {};
  }
  return {
    'data-indent': String(level),
    style: `margin-left: calc(var(--indent-step) * ${level});`,
  };
};

export const indentAttribute = {
  default: 0,
  parseHTML: (element: HTMLElement) => {
    return normalizeIndentAttr(element.getAttribute('data-indent'));
  },
  renderHTML: (attributes: { indent?: number }) => {
    return renderIndentAttributes(attributes.indent ?? 0);
  },
};
