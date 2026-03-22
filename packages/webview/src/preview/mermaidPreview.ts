/**
 * Mermaid preview runtime (runs inside iframe)
 *
 * - No external network (CSP connect-src 'none')
 * - Sandbox: allow-scripts only (opaque origin)
 * - Failure is shown in the iframe (no silent fallback)
 */
import mermaid from 'mermaid';

type MermaidThemeVariables = Partial<Record<string, string>>;

type Payload = {
  diagram: string;
  background: string;
  foreground: string;
  fontFamily: string;
  fontSize: string;
  themeVariables: MermaidThemeVariables;
};

const nowIso = (): string => new Date().toISOString();

const showError = (message: string, details?: unknown): void => {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  const pre = document.createElement('pre');
  pre.className = 'mermaid-preview-error';
  pre.textContent = details ? `${message}\n\n${String(details)}` : message;

  root.replaceChildren(pre);
};

const readPayload = (): Payload => {
  const payloadEl = document.getElementById('inlineMarkPayload');
  if (!payloadEl) {
    throw new Error('Payload element not found');
  }

  const raw = payloadEl.textContent ?? '';
  const parsed = JSON.parse(raw) as Partial<Payload>;
  if (typeof parsed.diagram !== 'string') {
    throw new Error('Invalid payload: diagram must be string');
  }

  return {
    diagram: parsed.diagram,
    background: typeof parsed.background === 'string' ? parsed.background : '#ffffff',
    foreground: typeof parsed.foreground === 'string' ? parsed.foreground : '#000000',
    fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : 'ui-sans-serif',
    fontSize: typeof parsed.fontSize === 'string' ? parsed.fontSize : '14px',
    themeVariables:
      parsed.themeVariables && typeof parsed.themeVariables === 'object'
        ? (parsed.themeVariables as MermaidThemeVariables)
        : {},
  };
};

const parseSvgElement = (svgText: string): SVGSVGElement => {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parseError = parsed.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Failed to parse Mermaid SVG: ${parseError.textContent ?? 'unknown parser error'}`);
  }

  const root = parsed.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    throw new Error('Rendered Mermaid output is not an SVG root element');
  }

  return root as SVGSVGElement;
};

const renderMermaid = async (): Promise<void> => {
  const startedAt = performance.now();

  const payload = readPayload();

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element not found');
  }

  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      ...payload.themeVariables,
      fontFamily: payload.fontFamily,
      fontSize: payload.fontSize,
    },
    securityLevel: 'strict',
    flowchart: {
      useMaxWidth: false,
      // CSP環境で foreignObject + inline style に依存しない描画へ寄せる
      htmlLabels: false,
    },
  });

  const id = `inlineMarkMermaid-${Math.random().toString(36).slice(2)}`;
  const { svg, bindFunctions } = await mermaid.render(id, payload.diagram);
  const svgElement = parseSvgElement(svg);
  svgElement.classList.add('inline-mark-mermaid-svg');
  svgElement.setAttribute('role', 'img');
  svgElement.setAttribute('aria-label', 'Mermaid diagram preview');

  root.replaceChildren(document.importNode(svgElement, true));
  bindFunctions?.(root);
  // Height reporter watches resize.
  window.dispatchEvent(new Event('resize'));

  console.log('[InlineMark][MermaidPreview]', nowIso(), 'Rendered', {
    durationMs: Math.round(performance.now() - startedAt),
    diagramLength: payload.diagram.length,
  });
};

void renderMermaid().catch((error) => {
  console.error('[InlineMark][MermaidPreview]', nowIso(), 'Render failed', error);
  showError('Mermaid preview failed', error);
});
