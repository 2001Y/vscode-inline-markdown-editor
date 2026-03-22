/**
 * Block preview controller (iframe-based)
 *
 * 役割: ブロック右上のトグルで「編集/プレビュー」を切り替える共通ロジック。
 * 方針:
 * - Preview は iframe に閉じる（HTML/Mermaid 共通）。
 * - ドキュメント（ProseMirror）には状態を保存しない（UI状態はランタイムに閉じる）。
 * - 失敗は握りつぶさず、ブロック内に明示しつつログに残す。
 */

import { createLogger, isDebugEnabled } from '../logger.js';
import { t } from './i18n.js';
import { getRuntimeConfig } from './runtimeConfig.js';

export type PreviewRenderer = 'html' | 'mermaid';

type HtmlPreviewConfig = {
  allowScripts: boolean;
  allowSameOrigin: boolean;
  allowPopups: boolean;
  allowForms: boolean;
};

type PreviewDocOptions = {
  foreground: string;
  fontFamily: string;
  fontSize: string;
  surfaceBackground: string;
  mutedBackground: string;
  borderColor: string;
  nonce: string | null;
  inheritedCssText: string;
  previewId: string;
  minHeight: number;
};

type MermaidDocOptions = PreviewDocOptions & {
  mermaidRuntimeCode: string;
};

const log = createLogger('BlockPreview');
const VSCODE_CDN_SOURCE = 'https://*.vscode-cdn.net';
const PREVIEW_CONTENT_HIDDEN_CLASS = 'block-preview-content-hidden';
const PREVIEW_HEIGHT_MESSAGE_TYPE = 'inlineMarkPreviewHeight';
const PREVIEW_DEBUG_REQUEST_MESSAGE_TYPE = 'inlineMarkPreviewDebugRequest';
const PREVIEW_DEBUG_RESPONSE_MESSAGE_TYPE = 'inlineMarkPreviewDebugResponse';
const PREVIEW_MIN_HEIGHT = 40;
const PREVIEW_MAX_HEIGHT = 8192;
const DEFAULT_MERMAID_FONT_SCALE = 0.8;
const MIN_MERMAID_FONT_SCALE = 0.1;
const MAX_MERMAID_FONT_SCALE = 4;
const textAssetCache = new Map<string, Promise<string>>();

const readCssVar = (name: string, fallback: string): string => {
  const rootValue = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (rootValue) {
    return rootValue;
  }
  const body = document.body;
  if (body) {
    const bodyValue = getComputedStyle(body).getPropertyValue(name).trim();
    if (bodyValue) {
      return bodyValue;
    }
  }
  return fallback;
};

const parsePixelSize = (value: string): number | null => {
  const matched = value.trim().match(/^-?\d+(?:\.\d+)?/);
  if (!matched) {
    return null;
  }
  const parsed = Number(matched[0]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const formatPixelSize = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}px`;
};

const resolveHtmlPreviewConfig = (): HtmlPreviewConfig => {
  const cfg = getRuntimeConfig();
  const html = cfg?.preview?.html;
  return {
    allowScripts: Boolean(html?.allowScripts),
    allowSameOrigin: Boolean(html?.allowSameOrigin),
    allowPopups: Boolean(html?.allowPopups),
    allowForms: Boolean(html?.allowForms),
  };
};

const buildSandbox = (renderer: PreviewRenderer): { sandbox: string; warnings: string[] } => {
  if (renderer === 'mermaid') {
    return {
      sandbox: ['allow-scripts'].join(' '),
      warnings: [],
    };
  }

  const cfg = resolveHtmlPreviewConfig();
  const tokens: string[] = ['allow-scripts'];
  const warnings: string[] = [];

  if (!cfg.allowScripts) {
    warnings.push('scriptsRestrictedByCsp');
  }
  if (cfg.allowSameOrigin) {
    tokens.push('allow-same-origin');
    warnings.push('allowSameOrigin');
  }
  if (cfg.allowPopups) {
    tokens.push('allow-popups');
  }
  if (cfg.allowForms) {
    tokens.push('allow-forms');
  }

  return {
    sandbox: tokens.join(' '),
    warnings,
  };
};

const stripScriptTags = (html: string): string => {
  return html
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
};

const escapeJsonForHtml = (value: unknown): string => {
  return JSON.stringify(value).replace(/</g, '\\u003c');
};

const escapeHtmlAttr = (value: string): string => {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
};

const escapeInlineStyleText = (value: string): string => {
  return value.replace(/<\/style/gi, '<\\/style');
};

const escapeInlineScriptText = (value: string): string => {
  return value.replace(/<\/script/gi, '<\\/script');
};

const nonceSource = (nonce: string | null): string => {
  return nonce ? `'nonce-${nonce}'` : '';
};

const nonceAttr = (nonce: string | null): string => {
  return nonce ? ` nonce="${escapeHtmlAttr(nonce)}"` : '';
};

const resolveWebviewNonce = (): string | null => {
  const element = document.querySelector('script[nonce], style[nonce]') as HTMLElement | null;
  const nonce = element?.nonce || element?.getAttribute('nonce') || '';
  const trimmed = nonce.trim();
  return trimmed || null;
};

const fetchTextAsset = async (url: string): Promise<string> => {
  const cached = textAssetCache.get(url);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  })();

  textAssetCache.set(url, pending);
  try {
    return await pending;
  } catch (error) {
    textAssetCache.delete(url);
    throw error;
  }
};

const splitSelectorList = (selectorText: string): string[] => {
  const selectors: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of selectorText) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      current += char;
      quote = char;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      current += char;
      continue;
    }
    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      current += char;
      continue;
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }
    if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        selectors.push(trimmed);
      }
      current = '';
      continue;
    }
    current += char;
  }

  const trailing = current.trim();
  if (trailing) {
    selectors.push(trailing);
  }

  return selectors;
};

const ROOT_ELEMENT_TOKEN_PATTERN = /(^|[^\w-])(html|body)(?=[^\w-]|$)/i;
const ROOT_PSEUDO_TOKEN_PATTERN = /(^|[^\w-]):root(?=[^\w-]|$)/i;

const maskSelectorForTokenCheck = (selector: string): string => {
  let masked = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let bracketDepth = 0;

  for (const char of selector) {
    if (escaped) {
      masked += ' ';
      escaped = false;
      continue;
    }
    if (char === '\\') {
      masked += ' ';
      escaped = true;
      continue;
    }
    if (quote) {
      masked += ' ';
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      masked += ' ';
      quote = char;
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      masked += ' ';
      continue;
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      masked += ' ';
      continue;
    }
    if (bracketDepth > 0) {
      masked += ' ';
      continue;
    }
    masked += char;
  }

  return masked;
};

const selectorTargetsRootElement = (selector: string): boolean => {
  const trimmed = selector.trim();
  if (!trimmed) {
    return false;
  }

  const masked = maskSelectorForTokenCheck(trimmed);
  if (ROOT_PSEUDO_TOKEN_PATTERN.test(masked) || ROOT_ELEMENT_TOKEN_PATTERN.test(masked)) {
    return true;
  }

  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) {
    return false;
  }
  try {
    return root.matches(trimmed) || body.matches(trimmed);
  } catch {
    return false;
  }
};

type SanitizationStats = {
  importedRuleCount: number;
  rootRuleDroppedCount: number;
  selectorDroppedCount: number;
  selectorKeptCount: number;
};

const createSanitizationStats = (): SanitizationStats => {
  return {
    importedRuleCount: 0,
    rootRuleDroppedCount: 0,
    selectorDroppedCount: 0,
    selectorKeptCount: 0,
  };
};

const sanitizeStyleRule = (rule: CSSStyleRule, stats: SanitizationStats): string => {
  let droppedSelectors = 0;
  let keptSelectors = 0;
  const filteredSelectors = splitSelectorList(rule.selectorText).filter(
    (selector) => {
      const shouldDrop = selectorTargetsRootElement(selector);
      if (shouldDrop) {
        droppedSelectors += 1;
      } else {
        keptSelectors += 1;
      }
      return !shouldDrop;
    }
  );
  stats.selectorDroppedCount += droppedSelectors;
  stats.selectorKeptCount += keptSelectors;

  if (filteredSelectors.length === 0) {
    if (droppedSelectors > 0) {
      stats.rootRuleDroppedCount += 1;
    }
    return '';
  }
  const styleText = rule.style.cssText.trim();
  if (!styleText) {
    return '';
  }
  return `${filteredSelectors.join(', ')} { ${styleText} }`;
};

type CssRuleWithChildren = CSSRule & { cssRules: CSSRuleList };

const hasCssRules = (rule: CSSRule): rule is CssRuleWithChildren => {
  return 'cssRules' in rule;
};

const groupingRuleTargetsRootElement = (rule: CSSRule): boolean => {
  const cssText = rule.cssText;
  const openIndex = cssText.indexOf('{');
  if (openIndex <= 0) {
    return false;
  }
  const prelude = cssText.slice(0, openIndex).trim();
  return selectorTargetsRootElement(prelude);
};

const wrapGroupingRule = (rule: CSSRule, innerCss: string): string => {
  const cssText = rule.cssText;
  const openIndex = cssText.indexOf('{');
  const closeIndex = cssText.lastIndexOf('}');
  if (openIndex >= 0 && closeIndex > openIndex) {
    const prelude = cssText.slice(0, openIndex).trim();
    return `${prelude} {\n${innerCss}\n}`;
  }
  return innerCss;
};

const sanitizeCssRuleList = (rules: CSSRuleList, stats: SanitizationStats): string => {
  const parts: string[] = [];
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSImportRule) {
      // Imported styles can reintroduce host-global body/html rules (e.g. workbench CSS).
      // Keep inheritance deterministic by resolving only in-document rules.
      stats.importedRuleCount += 1;
      continue;
    }
    if (rule instanceof CSSStyleRule) {
      const sanitized = sanitizeStyleRule(rule, stats);
      if (sanitized) {
        parts.push(sanitized);
      }
      continue;
    }
    if (hasCssRules(rule)) {
      if (groupingRuleTargetsRootElement(rule)) {
        stats.rootRuleDroppedCount += 1;
        continue;
      }
      const inner = sanitizeCssRuleList(rule.cssRules, stats);
      if (inner) {
        parts.push(wrapGroupingRule(rule, inner));
      }
      continue;
    }
    const unknownRuleCssText = rule.cssText;
    if (collectRootSelectorsFromCssText(unknownRuleCssText, 1).length > 0) {
      stats.rootRuleDroppedCount += 1;
      continue;
    }
    parts.push(unknownRuleCssText);
  }
  return parts.join('\n');
};

const sanitizeCssText = (rawCss: string, stats: SanitizationStats): string => {
  try {
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(rawCss);
    return sanitizeCssRuleList(stylesheet.cssRules, stats);
  } catch (error) {
    log.warn('Failed to sanitize inherited stylesheet text', { error: String(error) });
    return '';
  }
};

const collectRootSelectorsFromCssText = (cssText: string, maxSamples: number): string[] => {
  const samples: string[] = [];
  const rulePattern = /(^|[{}])\s*([^{}]+)\{/g;
  let matched: RegExpExecArray | null = null;

  while ((matched = rulePattern.exec(cssText))) {
    const selectorText = matched[2]?.trim() ?? '';
    if (!selectorText) {
      continue;
    }
    const selectors = splitSelectorList(selectorText);
    if (!selectors.some((selector) => selectorTargetsRootElement(selector))) {
      continue;
    }
    const normalized = selectorText.replace(/\s+/g, ' ');
    samples.push(normalized);
    if (samples.length >= maxSamples) {
      break;
    }
  }

  return samples;
};

const collectRootSelectorLeakSamples = (cssText: string, maxSamples = 3): string[] => {
  return collectRootSelectorsFromCssText(cssText, maxSamples);
};

const resolveInheritedStylesheetText = async (): Promise<string> => {
  const startedAt = Date.now();
  const cssParts: string[] = [];
  const fetchedHrefs = new Set<string>();
  const stats = createSanitizationStats();
  let cssRuleAccessedSheetCount = 0;
  let fetchedSheetCount = 0;

  for (const sheet of Array.from(document.styleSheets)) {
    const styleSheet = sheet as CSSStyleSheet;
    try {
      const sanitized = sanitizeCssRuleList(styleSheet.cssRules, stats);
      if (sanitized) {
        cssParts.push(sanitized);
      }
      cssRuleAccessedSheetCount += 1;
      continue;
    } catch {
      // Fall through to href fetch path.
    }

    const href = styleSheet.href?.trim();
    if (!href || fetchedHrefs.has(href)) {
      continue;
    }
    fetchedHrefs.add(href);

    try {
      const rawCss = await fetchTextAsset(href);
      const sanitized = sanitizeCssText(rawCss, stats);
      if (sanitized) {
        cssParts.push(sanitized);
      }
      fetchedSheetCount += 1;
    } catch (error) {
      log.warn('Failed to copy stylesheet for preview iframe', { href, error: String(error) });
    }
  }

  const inheritedCssText = cssParts.join('\n\n');
  const rootSelectorLeaks = collectRootSelectorLeakSamples(inheritedCssText);
  if (rootSelectorLeaks.length > 0) {
    log.warn('Inherited stylesheet still contains root-related selectors after sanitize', {
      rootSelectorLeaks,
    });
  }

  log.debug('Resolved inherited styles for preview iframe', {
    durationMs: Date.now() - startedAt,
    styleSheetCount: document.styleSheets.length,
    cssRuleAccessedSheetCount,
    fetchedSheetCount,
    inheritedCssLength: inheritedCssText.length,
    importedRuleCount: stats.importedRuleCount,
    rootRuleDroppedCount: stats.rootRuleDroppedCount,
    selectorDroppedCount: stats.selectorDroppedCount,
    selectorKeptCount: stats.selectorKeptCount,
  });

  return inheritedCssText;
};

const resolveMermaidPreviewScriptUrl = (): string => {
  const meta = document.querySelector('meta[name="inlineMark-mermaid-preview"]') as HTMLMetaElement | null;
  const fromMeta = meta?.content?.trim();
  if (fromMeta) {
    return fromMeta;
  }
  return new URL('mermaidPreviewStandalone.js', document.baseURI).toString();
};

const loadMermaidPreviewRuntime = async (): Promise<string> => {
  const url = resolveMermaidPreviewScriptUrl();
  return fetchTextAsset(url);
};

const buildHeightReporterScript = (previewId: string, minHeight: number): string => {
  const safePreviewId = JSON.stringify(previewId);
  const safeMinHeight = Number.isFinite(minHeight) ? Math.max(1, Math.floor(minHeight)) : PREVIEW_MIN_HEIGHT;
  return `
(() => {
  const PREVIEW_ID = ${safePreviewId};
  const MIN_HEIGHT = ${safeMinHeight};
  const HEIGHT_EPSILON = 2;
  const HEIGHT_TYPE = '${PREVIEW_HEIGHT_MESSAGE_TYPE}';
  const DEBUG_REQUEST_TYPE = '${PREVIEW_DEBUG_REQUEST_MESSAGE_TYPE}';
  const DEBUG_RESPONSE_TYPE = '${PREVIEW_DEBUG_RESPONSE_MESSAGE_TYPE}';
  const MARKER_ID = '__inlineMarkPreviewHeightMarker';
  const PREVIEW_ROOT_SELECTOR = '[data-inline-mark-preview-root="true"]';
  let lastHeight = 0;
  let rafId = 0;
  let settleTimerId = 0;
  let settleTicks = 0;
  const resolvePreviewRoot = () => {
    const element = document.querySelector(PREVIEW_ROOT_SELECTOR);
    if (element instanceof HTMLElement) {
      return element;
    }
    return document.body;
  };
  const ensureMarker = () => {
    let marker = document.getElementById(MARKER_ID);
    const root = resolvePreviewRoot();
    if (marker) {
      if (marker.parentElement !== root) {
        root.appendChild(marker);
      }
      return marker;
    }
    marker = document.createElement('div');
    marker.id = MARKER_ID;
    marker.setAttribute('aria-hidden', 'true');
    root.appendChild(marker);
    return marker;
  };
  const measureLayoutHeight = () => {
    const body = document.body;
    const root = resolvePreviewRoot();
    const bodyRect = body.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const rootHeight = Math.max(0, rootRect.bottom - bodyRect.top);
    const rootMetrics = Math.max(root.scrollHeight, root.offsetHeight);
    return Math.max(rootHeight, rootMetrics);
  };
  const measureHeight = () => {
    const body = document.body;
    const marker = ensureMarker();
    const bodyRect = body.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const flowHeight = Math.max(0, markerRect.bottom - bodyRect.top);
    const layoutHeight = measureLayoutHeight();
    return Math.max(flowHeight, layoutHeight);
  };
  const postHeight = () => {
    if (!document.body) {
      return;
    }
    const rawHeight = measureHeight();
    const height = Math.max(MIN_HEIGHT, Math.ceil(rawHeight));
    if (Math.abs(height - lastHeight) < HEIGHT_EPSILON) {
      return;
    }
    lastHeight = height;
    parent.postMessage({ type: HEIGHT_TYPE, previewId: PREVIEW_ID, height }, '*');
  };
  const collectBodyBackgroundRules = () => {
    const rows = [];
    let order = 0;
    for (const [sheetIndex, sheet] of [...document.styleSheets].entries()) {
      let rules;
      try {
        rules = [...sheet.cssRules];
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSStyleRule)) {
          continue;
        }
        order += 1;
        let matched = false;
        try {
          matched = document.body.matches(rule.selectorText);
        } catch {}
        if (!matched) {
          continue;
        }
        const background = rule.style.getPropertyValue('background');
        const backgroundColor = rule.style.getPropertyValue('background-color');
        if (!background && !backgroundColor) {
          continue;
        }
        rows.push({
          order,
          sheet: sheet.href || 'inline#' + sheetIndex,
          selector: rule.selectorText,
          background: background || '',
          bgImportant: rule.style.getPropertyPriority('background') || '',
          backgroundColor: backgroundColor || '',
          bgcImportant: rule.style.getPropertyPriority('background-color') || '',
        });
        if (rows.length >= 20) {
          return rows;
        }
      }
    }
    return rows;
  };
  const postDebugSnapshot = () => {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) {
      return;
    }
    const htmlStyle = getComputedStyle(html);
    const bodyStyle = getComputedStyle(body);
    parent.postMessage({
      type: DEBUG_RESPONSE_TYPE,
      previewId: PREVIEW_ID,
      href: location.href,
      htmlBg: htmlStyle.backgroundColor,
      bodyBg: bodyStyle.backgroundColor,
      htmlBlockShellVar: htmlStyle.getPropertyValue('--block-shell-bg').trim(),
      bodyBlockShellVar: bodyStyle.getPropertyValue('--block-shell-bg').trim(),
      styleSheetCount: document.styleSheets.length,
      bodyBackgroundRules: collectBodyBackgroundRules(),
    }, '*');
  };
  const schedule = () => {
    if (rafId !== 0) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      postHeight();
    });
  };
  const scheduleSettle = () => {
    if (settleTimerId !== 0) {
      clearTimeout(settleTimerId);
    }
    settleTicks = 0;
    const tick = () => {
      settleTicks += 1;
      schedule();
      if (settleTicks >= 20) {
        settleTimerId = 0;
        return;
      }
      settleTimerId = setTimeout(tick, 100);
    };
    settleTimerId = setTimeout(tick, 60);
  };
  window.addEventListener('load', schedule, { once: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('message', (event) => {
    const payload = event.data;
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (payload.type !== DEBUG_REQUEST_TYPE) {
      return;
    }
    if (payload.previewId !== PREVIEW_ID) {
      return;
    }
    postDebugSnapshot();
  });
  document.addEventListener('toggle', schedule, true);
  document.addEventListener('transitionend', schedule, true);
  document.addEventListener('animationend', schedule, true);
  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true
  });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => schedule());
    observer.observe(document.documentElement, { box: 'border-box' });
    if (document.body) {
      observer.observe(document.body, { box: 'border-box' });
    }
    const root = document.getElementById('root');
    if (root) {
      observer.observe(root, { box: 'border-box' });
    }
  }
  schedule();
  scheduleSettle();
})();
`;
};

const buildPreviewErrorDocument = (
  title: string,
  details: string,
  options: PreviewDocOptions
): string => {
  const parentOrigin = window.location.origin;
  const previewNonce = options.nonce ?? `inlineMarkPreview-${Math.random().toString(36).slice(2)}`;
  const nonce = nonceSource(previewNonce);
  const scriptNonce = nonceAttr(previewNonce);
  const scriptSrc = [nonce, parentOrigin, VSCODE_CDN_SOURCE].filter(Boolean).join(' ');
  const styleSrc = [`'unsafe-inline'`, parentOrigin, VSCODE_CDN_SOURCE].filter(Boolean).join(' ');
  const csp = [
    `default-src 'none'`,
    `base-uri 'none'`,
    `connect-src 'none'`,
    `img-src data:`,
    `font-src data: ${parentOrigin} ${VSCODE_CDN_SOURCE}`,
    `style-src ${styleSrc}`,
    `script-src ${scriptSrc}`,
  ].join('; ');
  const heightReporter = buildHeightReporterScript(options.previewId, options.minHeight);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body {
        height: 100%;
        background: transparent;
      }
      body {
        margin: 0;
        padding: 12px;
        background: transparent;
        color: ${options.foreground};
        font-family: ${options.fontFamily};
        font-size: ${options.fontSize};
      }
      pre {
        margin: 0;
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(127, 127, 127, 0.35);
        white-space: pre-wrap;
        word-break: break-word;
      }
      #__inlineMarkPreviewHeightMarker {
        display: block;
        height: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }
    </style>
  </head>
  <body>
    <pre data-inline-mark-preview-root="true">${escapeHtmlAttr(`${title}\n\n${details}`)}</pre>
    <script${scriptNonce}>${escapeInlineScriptText(heightReporter)}</script>
  </body>
</html>`;
};

const buildHtmlPreviewDocument = (sourceHtml: string, options: PreviewDocOptions): string => {
  const cfg = resolveHtmlPreviewConfig();
  const parentOrigin = window.location.origin;
  const previewNonce = options.nonce ?? `inlineMarkPreview-${Math.random().toString(36).slice(2)}`;
  const nonce = nonceSource(previewNonce);
  const styleSrc = [`'unsafe-inline'`, parentOrigin, VSCODE_CDN_SOURCE].filter(Boolean).join(' ');
  const scriptSrc = cfg.allowScripts
    ? [`'unsafe-inline'`, parentOrigin, VSCODE_CDN_SOURCE].filter(Boolean).join(' ')
    : [nonce].filter(Boolean).join(' ');
  const styleNonce = nonceAttr(previewNonce);
  const scriptNonce = nonceAttr(previewNonce);
  const inheritedCssTag = options.inheritedCssText
    ? `<style${styleNonce}>${escapeInlineStyleText(options.inheritedCssText)}</style>`
    : '';
  const previewHtml = cfg.allowScripts ? sourceHtml : stripScriptTags(sourceHtml);
  const heightReporter = buildHeightReporterScript(options.previewId, options.minHeight);

  const csp = [
    `default-src 'none'`,
    `base-uri 'none'`,
    `connect-src 'none'`,
    `img-src data: ${parentOrigin} ${VSCODE_CDN_SOURCE}`,
    `font-src data: ${parentOrigin} ${VSCODE_CDN_SOURCE}`,
    `style-src ${styleSrc}`,
    `script-src ${scriptSrc}`,
  ].join('; ');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${inheritedCssTag}
    <style${styleNonce}>
      :root {
        color-scheme: light dark;
      }
      :where(*, *::before, *::after) {
        box-sizing: border-box;
      }
      :where(body, h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd, pre) {
        margin: 0;
      }
      html, body {
        min-height: 0;
        height: auto;
        overflow: visible;
        background: transparent;
      }
      body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: ${options.foreground};
        font-family: ${options.fontFamily};
        font-size: ${options.fontSize};
        box-sizing: border-box;
      }
      .inline-markdown-editor-content,
      .preview-markdown-content {
        background: transparent;
      }
      :where(a, button, summary, [role='button'], label[for]) {
        cursor: pointer;
      }
      :where(input, button, textarea, select) {
        font: inherit;
        color: inherit;
      }
      :where(dialog) {
        color: inherit;
        background: var(--vscode-editorWidget-background, ${options.surfaceBackground});
        border: 1px solid var(--vscode-editorWidget-border, ${options.borderColor});
        cursor: default;
      }
      .preview-markdown-content {
        min-height: 0;
        max-width: none;
        content-visibility: visible;
        contain: none;
      }
      .preview-markdown-content::after,
      .tiptap::after {
        content: none;
        display: none;
        height: 0;
      }
      .preview-markdown-content > :first-child {
        margin-top: 0;
      }
      .preview-markdown-content > :last-child {
        margin-bottom: 0;
      }
      #__inlineMarkPreviewHeightMarker {
        display: block;
        height: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }
    </style>
  </head>
  <body>
    <div class="inline-markdown-editor-content preview-markdown-content" data-inline-mark-preview-root="true">${previewHtml}</div>
    <script${scriptNonce}>${escapeInlineScriptText(heightReporter)}</script>
  </body>
</html>`;
};

const buildMermaidPreviewDocument = (diagram: string, options: MermaidDocOptions): string => {
  const parentOrigin = window.location.origin;
  const previewNonce = options.nonce ?? `inlineMarkPreview-${Math.random().toString(36).slice(2)}`;
  const nonce = nonceSource(previewNonce);
  const scriptBase = [nonce, parentOrigin, VSCODE_CDN_SOURCE].filter(Boolean).join(' ');
  const styleSrc = [`'unsafe-inline'`, parentOrigin, VSCODE_CDN_SOURCE].filter(Boolean).join(' ');
  const scriptNonce = nonceAttr(previewNonce);
  const styleNonce = nonceAttr(previewNonce);
  const payload = {
    diagram,
    background: 'transparent',
    foreground: options.foreground,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    themeVariables: {
      background: 'transparent',
      lineColor: options.foreground,
      textColor: options.foreground,
      primaryColor: options.surfaceBackground,
      primaryTextColor: options.foreground,
      primaryBorderColor: options.borderColor,
      secondaryColor: options.surfaceBackground,
      secondaryTextColor: options.foreground,
      secondaryBorderColor: options.borderColor,
      tertiaryColor: options.mutedBackground,
      tertiaryTextColor: options.foreground,
      tertiaryBorderColor: options.borderColor,
      clusterBkg: options.mutedBackground,
      clusterBorder: options.borderColor,
      edgeLabelBackground: 'transparent',
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
    },
  };
  const heightReporter = buildHeightReporterScript(options.previewId, options.minHeight);

  const csp = [
    `default-src 'none'`,
    `base-uri 'none'`,
    `connect-src 'none'`,
    `img-src data: ${VSCODE_CDN_SOURCE}`,
    `font-src data: ${parentOrigin} ${VSCODE_CDN_SOURCE}`,
    `style-src ${styleSrc}`,
    `script-src ${scriptBase}`,
  ].join('; ');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style${styleNonce}>
      :root {
        color-scheme: light dark;
      }
      :where(*, *::before, *::after) {
        box-sizing: border-box;
      }
      html, body {
        min-height: 0;
        height: auto;
        overflow: visible;
        background: transparent;
      }
      body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: ${options.foreground};
        font-family: ${options.fontFamily};
        font-size: ${options.fontSize};
        box-sizing: border-box;
      }
      #root {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        width: 100%;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0;
      }
      #root > .inline-mark-mermaid-svg {
        display: block;
        width: auto;
        max-width: none;
        height: auto;
        margin: 0 auto;
        background: transparent;
      }
      .mermaid-preview-error {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(127,127,127,0.35);
      }
      #__inlineMarkPreviewHeightMarker {
        display: block;
        height: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }
    </style>
  </head>
  <body>
    <script${scriptNonce} id="inlineMarkPayload" type="application/json">${escapeJsonForHtml(payload)}</script>
    <div id="root" data-inline-mark-preview-root="true" role="img" aria-label="Mermaid diagram preview"></div>
    <script${scriptNonce}>${escapeInlineScriptText(options.mermaidRuntimeCode)}</script>
    <script${scriptNonce}>${escapeInlineScriptText(heightReporter)}</script>
  </body>
</html>`;
};

export class BlockPreviewController {
  private renderer: PreviewRenderer;
  private readonly host: HTMLElement;
  private toolbar: HTMLElement;
  private switchText: HTMLSpanElement;
  private switchLabel: HTMLLabelElement;
  private switchInput: HTMLInputElement;
  private previewContainer: HTMLElement;
  private previewEnabled = false;
  private previewLoading = false;
  private available = false;
  private activePreviewId: string | null = null;
  private enterRequestId = 0;

  private iframe: HTMLIFrameElement | null = null;
  private blobUrl: string | null = null;
  private readonly contentDom: HTMLElement;
  private readonly getSource: () => string;
  private readonly padded: boolean;
  private readonly defaultPreviewEnabled: boolean;
  private readonly onPreviewMessageBound: (event: MessageEvent) => void;
  private lastRenderedSource = '';
  private autoPreviewAttempted = false;

  constructor(params: {
    renderer: PreviewRenderer;
    host: HTMLElement;
    contentDom: HTMLElement;
    getSource: () => string;
    padded: boolean;
    initialAvailable: boolean;
    defaultPreviewEnabled?: boolean;
  }) {
    this.renderer = params.renderer;
    this.host = params.host;
    this.contentDom = params.contentDom;
    this.getSource = params.getSource;
    this.padded = params.padded;
    this.defaultPreviewEnabled = params.defaultPreviewEnabled !== false;
    this.available = params.initialAvailable;
    this.onPreviewMessageBound = (event) => this.onPreviewMessage(event);

    this.toolbar = document.createElement('span');
    this.toolbar.className = 'block-preview-toolbar';
    this.toolbar.setAttribute('contenteditable', 'false');

    this.switchLabel = document.createElement('label');
    this.switchLabel.className = 'block-preview-switch';
    this.switchLabel.setAttribute('contenteditable', 'false');

    this.switchText = document.createElement('span');
    this.switchText.className = 'block-preview-switch-label';
    this.switchText.setAttribute('aria-hidden', 'true');
    this.switchText.textContent = t().preview.show;

    this.switchInput = document.createElement('input');
    this.switchInput.type = 'checkbox';
    this.switchInput.className = 'block-preview-switch-input';
    this.switchInput.setAttribute('contenteditable', 'false');
    this.switchInput.addEventListener('change', () => {
      this.toggle(this.switchInput.checked);
    });

    const switchTrack = document.createElement('span');
    switchTrack.className = 'block-preview-switch-track';
    switchTrack.setAttribute('aria-hidden', 'true');
    const switchThumb = document.createElement('span');
    switchThumb.className = 'block-preview-switch-thumb';
    switchTrack.appendChild(switchThumb);

    this.switchLabel.appendChild(this.switchText);
    this.switchLabel.appendChild(this.switchInput);
    this.switchLabel.appendChild(switchTrack);
    this.toolbar.appendChild(this.switchLabel);
    params.host.appendChild(this.toolbar);

    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'block-preview-container';
    this.previewContainer.setAttribute('contenteditable', 'false');
    if (this.padded) {
      this.previewContainer.classList.add('is-padded');
    }
    params.host.appendChild(this.previewContainer);

    this.syncUi();
    this.maybeEnterDefaultPreview();
  }

  getToolbarElement(): HTMLElement {
    return this.toolbar;
  }

  setAvailable(available: boolean): void {
    if (this.available === available) {
      return;
    }
    this.available = available;
    if (!available && (this.previewEnabled || this.previewLoading)) {
      this.exitPreview('availability-changed');
    }
    this.syncUi();
    if (available) {
      this.maybeEnterDefaultPreview();
    }
  }

  updateRenderer(renderer: PreviewRenderer): void {
    if (this.renderer === renderer) {
      return;
    }
    const wasPreview = this.previewEnabled || this.previewLoading;
    if (wasPreview) {
      this.exitPreview('renderer-changed');
    }
    this.renderer = renderer;
    this.syncUi();
  }

  notifySourceChanged(): void {
    if (!this.previewEnabled || this.previewLoading || !this.available) {
      return;
    }
    const nextSource = this.getSource();
    if (nextSource === this.lastRenderedSource) {
      return;
    }
    void this.enterPreview();
  }

  destroy(): void {
    this.exitPreview('destroy');
    this.switchText.remove();
    this.switchInput.remove();
    this.switchLabel.remove();
    this.toolbar.remove();
    this.previewContainer.remove();
  }

  private toggle(shouldEnable: boolean): void {
    if (!this.available || this.previewLoading) {
      return;
    }
    if (!shouldEnable && this.previewEnabled) {
      this.exitPreview('toggle-off');
      return;
    }
    if (!shouldEnable) {
      return;
    }
    void this.enterPreview();
  }

  private syncUi(): void {
    this.toolbar.classList.toggle('is-hidden', !this.available);
    const label = this.previewEnabled ? t().preview.edit : t().preview.show;
    this.switchText.textContent = t().preview.show;
    this.switchLabel.title = label;
    this.switchInput.setAttribute('aria-label', label);
    this.switchInput.setAttribute('aria-checked', this.previewEnabled ? 'true' : 'false');
    this.switchInput.checked = this.previewEnabled;
    this.switchInput.disabled = !this.available || this.previewLoading;
    this.switchLabel.classList.toggle('is-active', this.previewEnabled);
    this.switchLabel.classList.toggle('is-disabled', this.switchInput.disabled);
  }

  private maybeEnterDefaultPreview(): void {
    if (!this.defaultPreviewEnabled || this.autoPreviewAttempted) {
      return;
    }
    if (!this.available || this.previewEnabled || this.previewLoading) {
      return;
    }
    this.autoPreviewAttempted = true;
    void this.enterPreview();
  }

  private createPreviewId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private normalizePreviewHeight(value: number): number {
    if (!Number.isFinite(value)) {
      return PREVIEW_MIN_HEIGHT;
    }
    const rounded = Math.max(PREVIEW_MIN_HEIGHT, Math.round(value));
    return Math.min(PREVIEW_MAX_HEIGHT, rounded);
  }

  private onPreviewMessage(event: MessageEvent): void {
    if (!this.previewEnabled || !this.iframe || !this.activePreviewId) {
      return;
    }
    if (!event.data || typeof event.data !== 'object') {
      return;
    }

    const payload = event.data as {
      type?: unknown;
      previewId?: unknown;
      height?: unknown;
      href?: unknown;
      htmlBg?: unknown;
      bodyBg?: unknown;
      htmlBlockShellVar?: unknown;
      bodyBlockShellVar?: unknown;
      styleSheetCount?: unknown;
      bodyBackgroundRules?: unknown;
    };
    if (payload.previewId !== this.activePreviewId) {
      return;
    }

    if (payload.type === PREVIEW_HEIGHT_MESSAGE_TYPE) {
      const height = this.normalizePreviewHeight(Number(payload.height));
      this.iframe.setAttribute('height', String(height));
      this.iframe.style.height = `${height}px`;
      return;
    }

    if (payload.type === PREVIEW_DEBUG_RESPONSE_MESSAGE_TYPE) {
      const bodyBackgroundRules = Array.isArray(payload.bodyBackgroundRules)
        ? payload.bodyBackgroundRules.slice(0, 20)
        : [];
      log.debug('Preview iframe style diagnostics', {
        renderer: this.renderer,
        href: typeof payload.href === 'string' ? payload.href : '',
        htmlBg: typeof payload.htmlBg === 'string' ? payload.htmlBg : '',
        bodyBg: typeof payload.bodyBg === 'string' ? payload.bodyBg : '',
        htmlBlockShellVar:
          typeof payload.htmlBlockShellVar === 'string' ? payload.htmlBlockShellVar : '',
        bodyBlockShellVar:
          typeof payload.bodyBlockShellVar === 'string' ? payload.bodyBlockShellVar : '',
        styleSheetCount: Number(payload.styleSheetCount) || 0,
        bodyBackgroundRules,
      });
    }
  }

  private async enterPreview(): Promise<void> {
    const startedAt = Date.now();
    const requestId = ++this.enterRequestId;
    if (this.previewEnabled) {
      this.exitPreview('refresh');
    }
    this.previewLoading = true;
    this.syncUi();

    const source = this.getSource();
    const background = readCssVar('--vscode-editor-background', '#ffffff');
    const foreground = readCssVar('--vscode-editor-foreground', '#000000');
    const fontFamily = readCssVar('--vscode-editor-font-family', 'ui-sans-serif');
    const fontSize = readCssVar('--vscode-editor-font-size', '14px');
    const configuredMermaidFontScale = Number(
      getRuntimeConfig()?.preview?.mermaid?.fontScale ?? DEFAULT_MERMAID_FONT_SCALE
    );
    const mermaidFontScale = Number.isFinite(configuredMermaidFontScale)
      ? clampNumber(configuredMermaidFontScale, MIN_MERMAID_FONT_SCALE, MAX_MERMAID_FONT_SCALE)
      : DEFAULT_MERMAID_FONT_SCALE;
    const fontSizePx = parsePixelSize(fontSize);
    const mermaidFontSize = fontSizePx
      ? formatPixelSize(fontSizePx * mermaidFontScale)
      : fontSize;
    const surfaceBackground = readCssVar('--vscode-editorWidget-background', background);
    const mutedBackground = readCssVar(
      '--inline-mark-opaque-block-shell-bg',
      readCssVar('--vscode-textCodeBlock-background', surfaceBackground)
    );
    const borderColor = readCssVar('--vscode-editorWidget-border', foreground);
    const nonce = resolveWebviewNonce();
    const previewId = this.createPreviewId();

    let inheritedCssText = '';
    try {
      inheritedCssText = await resolveInheritedStylesheetText();
    } catch (error) {
      log.warn('Failed to resolve inherited styles for preview iframe', { error: String(error) });
    }

    if (requestId !== this.enterRequestId || !this.available) {
      this.previewLoading = false;
      this.syncUi();
      return;
    }

    const previewOptions: PreviewDocOptions = {
      foreground,
      fontFamily,
      fontSize: this.renderer === 'mermaid' ? mermaidFontSize : fontSize,
      surfaceBackground,
      mutedBackground,
      borderColor,
      nonce,
      inheritedCssText,
      previewId,
      minHeight: PREVIEW_MIN_HEIGHT,
    };

    let doc = '';
    if (this.renderer === 'html') {
      doc = buildHtmlPreviewDocument(source, previewOptions);
    } else {
      try {
        const mermaidRuntimeCode = await loadMermaidPreviewRuntime();
        if (requestId !== this.enterRequestId || !this.available) {
          this.previewLoading = false;
          this.syncUi();
          return;
        }
        doc = buildMermaidPreviewDocument(source, {
          ...previewOptions,
          mermaidRuntimeCode,
        });
      } catch (error) {
        log.error('Failed to load Mermaid preview assets', { error: String(error) });
        doc = buildPreviewErrorDocument(
          'Mermaid preview failed to load assets',
          String(error),
          previewOptions
        );
      }
    }

    const { sandbox, warnings } = buildSandbox(this.renderer);
    if (warnings.length > 0) {
      log.warn('Preview sandbox relaxed', { renderer: this.renderer, warnings });
    }

    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.className = 'block-preview-iframe';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute('height', String(PREVIEW_MIN_HEIGHT));
    if (sandbox) {
      iframe.setAttribute('sandbox', sandbox);
    } else {
      iframe.setAttribute('sandbox', '');
    }
    if (isDebugEnabled()) {
      iframe.addEventListener(
        'load',
        () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.postMessage(
                { type: PREVIEW_DEBUG_REQUEST_MESSAGE_TYPE, previewId },
                '*'
              );
            } catch (error) {
              log.warn('Failed to request preview iframe style diagnostics', {
                error: String(error),
              });
            }
          }, 0);
        },
        { once: true }
      );
    }
    iframe.src = url;

    this.previewContainer.replaceChildren(iframe);
    this.previewContainer.classList.add('is-visible');
    this.iframe = iframe;
    this.blobUrl = url;
    this.activePreviewId = previewId;

    this.contentDom.classList.add(PREVIEW_CONTENT_HIDDEN_CLASS);
    this.previewEnabled = true;
    this.previewLoading = false;
    this.lastRenderedSource = source;
    window.removeEventListener('message', this.onPreviewMessageBound);
    window.addEventListener('message', this.onPreviewMessageBound);
    this.syncUi();

    log.info('Preview enabled', {
      renderer: this.renderer,
      sourceLength: source.length,
      docLength: doc.length,
      sandbox,
      durationMs: Date.now() - startedAt,
    });
  }

  private exitPreview(reason: string): void {
    if (!this.previewEnabled && !this.previewLoading) {
      return;
    }
    const startedAt = Date.now();
    const wasEnabled = this.previewEnabled;

    this.enterRequestId += 1;
    this.previewLoading = false;
    this.previewEnabled = false;
    this.activePreviewId = null;
    this.contentDom.classList.remove(PREVIEW_CONTENT_HIDDEN_CLASS);

    this.previewContainer.classList.remove('is-visible');
    this.previewContainer.replaceChildren();
    this.iframe = null;
    window.removeEventListener('message', this.onPreviewMessageBound);

    if (this.blobUrl) {
      try {
        URL.revokeObjectURL(this.blobUrl);
      } catch (error) {
        log.warn('Failed to revoke preview blob URL', { reason, error: String(error) });
      }
      this.blobUrl = null;
    }

    this.syncUi();
    if (wasEnabled) {
      log.info('Preview disabled', { renderer: this.renderer, reason, durationMs: Date.now() - startedAt });
    }
  }
}
