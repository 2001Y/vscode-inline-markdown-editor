/**
 * Inline Drag Handle Extension (ListItem aware)
 *
 * 役割: DragHandle の最小実装（listItem を含む任意ブロックに対応）
 * 責務: 近傍ブロック検出・ハンドル表示・ドラッグ開始
 * 不変条件: table は対象外。失敗は隠さずログに残す。
 */

import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, NodeSelection, Selection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import {
  computePosition,
  type ComputePositionConfig,
  type VirtualElement,
} from '@floating-ui/dom';
import { DEBUG } from './debug.js';
import { notifyHostWarn } from './hostNotifier.js';
import { LIST_MAX_DEPTH } from './listIndentConfig.js';

const MODULE = 'InlineDragHandle';
const TABLE_CELL_SELECTOR = 'td, th';
const LIST_CONTAINER_SELECTOR = 'ul, ol';
const LIST_INDENT_STEP_PX = 24;
const LIST_MARKER_GAP_PX = 6;
const DROPCURSOR_SELECTOR = '.inline-markdown-dropcursor';
const HANDLE_LAYER_DECORATION_KEY = 'inline-handle-layer';

const logInfo = (msg: string, data?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[INFO][${MODULE}] ${timestamp} ${msg}`, data);
  } else {
    console.log(`[INFO][${MODULE}] ${timestamp} ${msg}`);
  }
};

const logSuccess = (msg: string, data?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[SUCCESS][${MODULE}] ${timestamp} ${msg}`, data);
  } else {
    console.log(`[SUCCESS][${MODULE}] ${timestamp} ${msg}`);
  }
};

const logWarning = (msg: string, data?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.warn(`[WARNING][${MODULE}] ${timestamp} ${msg}`, data);
  } else {
    console.warn(`[WARNING][${MODULE}] ${timestamp} ${msg}`);
  }
};

const logError = (msg: string, data?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.error(`[ERROR][${MODULE}] ${timestamp} ${msg}`, data);
  } else {
    console.error(`[ERROR][${MODULE}] ${timestamp} ${msg}`);
  }
};

export const InlineDragHandlePluginKey = new PluginKey('inlineDragHandle');

export interface InlineDragHandleOptions {
  render: () => HTMLElement;
  computePositionConfig?: ComputePositionConfig;
  getReferencedVirtualElement?: () => VirtualElement | null;
  locked?: boolean;
  allowedNodeTypes?: Set<string>;
  onNodeChange?: (options: { node: ProseMirrorNode | null; editor: Editor; pos: number }) => void;
  onElementDragStart?: (e: DragEvent) => void;
  onElementDragEnd?: (e: DragEvent) => void;
}

type PluginState = {
  locked: boolean;
};

const defaultComputePositionConfig: ComputePositionConfig = {
  placement: 'left-start',
  strategy: 'absolute',
};

const createHandleLayerDecorations = (doc: ProseMirrorNode, wrapper: HTMLElement): DecorationSet => {
  return DecorationSet.create(doc, [
    Decoration.widget(0, wrapper, {
      key: HANDLE_LAYER_DECORATION_KEY,
      ignoreSelection: true,
      stopEvent: () => true,
    }),
  ]);
};

const isOverlayElement = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.closest('.inline-handle-layer')) {
    return true;
  }
  if (element.classList.contains('inline-markdown-dropcursor') || element.classList.contains('ProseMirror-dropcursor')) {
    return true;
  }
  return false;
};

const clampPointToRect = (rect: DOMRect, x: number, y: number, padding = 2): { x: number; y: number } => {
  const left = rect.left + padding;
  const right = rect.right - padding;
  const top = rect.top + padding;
  const bottom = rect.bottom - padding;
  return {
    x: Math.min(Math.max(x, left), right),
    y: Math.min(Math.max(y, top), bottom),
  };
};

const getElementsFromPoint = (view: EditorView, x: number, y: number): Element[] => {
  const root = view.root as Document | ShadowRoot | undefined;
  if (root && typeof (root as Document | ShadowRoot).elementsFromPoint === 'function') {
    return (root as Document | ShadowRoot).elementsFromPoint(x, y);
  }
  return document.elementsFromPoint(x, y);
};

const safePosAtDOM = (view: EditorView, element: HTMLElement): number | null => {
  try {
    return view.posAtDOM(element, 0);
  } catch {
    return null;
  }
};

const resolveAllowedNodeFromResolvedPos = (
  $pos: ReturnType<ProseMirrorNode['resolve']>,
  allowedNodeTypes?: Set<string>
): { node: ProseMirrorNode; pos: number } | null => {
  let fallback: { node: ProseMirrorNode; pos: number } | null = null;

  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.spec.tableRole) {
      continue;
    }
    if (allowedNodeTypes?.has('listItem') && node.type.name === 'listItem') {
      return { node, pos: $pos.before(depth) };
    }
    const isAllowed = allowedNodeTypes ? allowedNodeTypes.has(node.type.name) : node.isBlock;
    if (!fallback && isAllowed) {
      fallback = { node, pos: $pos.before(depth) };
    }
  }

  return fallback;
};

const estimateMarkerExtraPx = (list: HTMLElement, listItem: HTMLElement): number => {
  const fontSize = Number.parseFloat(window.getComputedStyle(listItem).fontSize || '0');
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return 8;
  }

  if (list.tagName.toLowerCase() === 'ol') {
    const items = Array.from(list.children).filter((node) => node.tagName.toLowerCase() === 'li');
    const startAttr = Number.parseInt(list.getAttribute('start') || '1', 10);
    const startValue = Number.isFinite(startAttr) ? startAttr : 1;
    const index = items.indexOf(listItem);
    const current = Math.max(startValue, startValue + Math.max(index, 0));
    const digits = String(current).length;
    return fontSize * (digits + 0.6);
  }

  return fontSize * 0.9;
};

const resolveListOffsetX = (listItem: HTMLElement): number | null => {
  const list = listItem.closest(LIST_CONTAINER_SELECTOR) as HTMLElement | null;
  if (!list) {
    return null;
  }

  const listRect = list.getBoundingClientRect();
  const itemRect = listItem.getBoundingClientRect();
  const baseOffset = itemRect.left - listRect.left;

  if (!Number.isFinite(baseOffset)) {
    return null;
  }

  const listStyles = window.getComputedStyle(list);
  if (listStyles.listStyleType === 'none') {
    return Math.max(0, baseOffset);
  }

  if (baseOffset <= 0) {
    return null;
  }

  const listStylePosition = listStyles.listStylePosition;
  const markerExtra = listStylePosition === 'inside' ? 0 : estimateMarkerExtraPx(list, listItem);

  return baseOffset + markerExtra + LIST_MARKER_GAP_PX;
};

const resolveTableCell = (element: HTMLElement): HTMLElement | null => {
  return element.closest(TABLE_CELL_SELECTOR) as HTMLElement | null;
};

const resolveListItem = (element: HTMLElement): HTMLElement | null => {
  return element.closest('li') as HTMLElement | null;
};

const resolveListItemPosFromElement = (view: EditorView, element: Element): number | null => {
  const listItem = resolveListItem(element as HTMLElement);
  if (!listItem) {
    return null;
  }

  const doc = view.state.doc;
  const textProbe =
    (listItem.querySelector('p, h1, h2, h3, h4, h5, h6, pre, blockquote') as HTMLElement | null) ??
    (listItem.firstElementChild as HTMLElement | null) ??
    listItem;

  const probePos = safePosAtDOM(view, textProbe);
  if (probePos !== null) {
    const nearest = findNearestListItemPos(doc, probePos);
    if (nearest !== null) {
      return nearest;
    }
  }

  const listPos = safePosAtDOM(view, listItem);
  if (listPos !== null) {
    const shifted = Math.min(doc.content.size, listPos + 1);
    return findNearestListItemPos(doc, shifted) ?? findNearestListItemPos(doc, listPos);
  }

  return null;
};

const resolveListItemTextStartX = (listItem: HTMLElement): number | null => {
  const rect = listItem.getBoundingClientRect();
  const style = window.getComputedStyle(listItem);
  const paddingValue = style.paddingInlineStart || style.paddingLeft || '0';
  const padding = Number.parseFloat(paddingValue);
  if (!Number.isFinite(rect.left)) {
    return null;
  }
  return rect.left + (Number.isFinite(padding) ? Math.max(0, padding) : 0);
};

const getListItemDepth = (doc: ProseMirrorNode, insidePos: number): number => {
  const $pos = doc.resolve(insidePos);
  let depth = 0;
  for (let d = $pos.depth; d >= 0; d -= 1) {
    if ($pos.node(d).type.name === 'listItem') {
      depth += 1;
    }
  }
  return depth;
};

const findNearestListItemPos = (doc: ProseMirrorNode, fromPos: number): number | null => {
  const $pos = doc.resolve(fromPos);
  for (let d = $pos.depth; d >= 0; d -= 1) {
    if ($pos.node(d).type.name === 'listItem') {
      return $pos.before(d);
    }
  }
  return null;
};

const findClosestAllowedNode = (
  element: Element,
  view: EditorView,
  allowedNodeTypes?: Set<string>
): { element: HTMLElement; node: ProseMirrorNode; pos: number } | null => {
  if (isOverlayElement(element)) {
    return null;
  }
  if ((element as HTMLElement).closest(TABLE_CELL_SELECTOR)) {
    return null;
  }

  let current: HTMLElement | null = element as HTMLElement;
  const allowed = allowedNodeTypes;

  while (current && current !== view.dom) {
    if (isOverlayElement(current)) {
      current = current.parentElement;
      continue;
    }

    if (allowed?.has('listItem')) {
      const listItemPos = resolveListItemPosFromElement(view, current);
      if (listItemPos !== null) {
        const node = view.state.doc.nodeAt(listItemPos);
        if (node && node.type.name === 'listItem') {
          const nodeDom = view.nodeDOM(listItemPos) as HTMLElement | null;
          if (nodeDom && nodeDom !== view.dom) {
            return { element: nodeDom, node, pos: listItemPos };
          }
        }
      }
    }

    const pos = safePosAtDOM(view, current);
    if (pos !== null && pos >= 0) {
      const $pos = view.state.doc.resolve(pos);
      const resolved = resolveAllowedNodeFromResolvedPos($pos, allowed);
      if (resolved) {
        const nodeDom = view.nodeDOM(resolved.pos) as HTMLElement | null;
        if (nodeDom && nodeDom !== view.dom) {
          return { element: nodeDom, node: resolved.node, pos: resolved.pos };
        }
      }
    }

    current = current.parentElement;
  }

  return null;
};

const findElementNextToCoords = (options: {
  x: number;
  y: number;
  editor: Editor;
  allowedNodeTypes?: Set<string>;
}): { resultElement: HTMLElement | null; resultNode: ProseMirrorNode | null; pos: number | null } => {
  const { x, y, editor, allowedNodeTypes } = options;
  const { view } = editor;

  if (allowedNodeTypes?.has('listItem')) {
    const listItemPos = resolveListItemPosFromCoords(view, editor.state.doc, x, y);
    if (listItemPos !== null) {
      const node = editor.state.doc.nodeAt(listItemPos);
      if (node && node.type.name === 'listItem') {
        const nodeDom = view.nodeDOM(listItemPos) as HTMLElement | null;
        if (nodeDom && nodeDom !== view.dom) {
          if (DEBUG.enabled) {
            DEBUG.log(MODULE, 'List item target resolved (coords)', {
              pos: listItemPos,
              depth: getListItemDepth(editor.state.doc, listItemPos + 1),
            });
          }
          return { resultElement: nodeDom, resultNode: node, pos: listItemPos };
        }
      }
    }
  }

  const viewRect = view.dom.getBoundingClientRect();
  const clamped = clampPointToRect(viewRect, x, y, 2);
  const offsets = [0, LIST_INDENT_STEP_PX, LIST_INDENT_STEP_PX * 2, LIST_INDENT_STEP_PX * 3];
  const sampleXs = offsets.map((offset) => Math.min(viewRect.right - 2, clamped.x + offset));
  let hit: { element: HTMLElement; node: ProseMirrorNode; pos: number } | null = null;
  const debugSamples: Array<{ x: number; tags: string[] }> = [];

  for (const sampleX of sampleXs) {
    const elements = getElementsFromPoint(view, sampleX, clamped.y);
    if (DEBUG.enabled) {
      debugSamples.push({
        x: Math.round(sampleX),
        tags: elements.slice(0, 6).map((el) => {
          const tag = el instanceof HTMLElement ? el.tagName.toLowerCase() : String(el);
          const className = el instanceof HTMLElement ? el.className : '';
          return className ? `${tag}.${String(className).split(' ').join('.')}` : tag;
        }),
      });
    }
    for (const el of elements) {
      if (!view.dom.contains(el)) {
        continue;
      }
      if (isOverlayElement(el)) {
        continue;
      }
      const candidate = findClosestAllowedNode(el, view, allowedNodeTypes);
      if (!candidate) {
        continue;
      }
      if (!hit) {
        hit = candidate;
      } else if (candidate.node.type.name === 'listItem' && hit.node.type.name !== 'listItem') {
        hit = candidate;
      } else if (candidate.node.type.name === 'listItem' && hit.node.type.name === 'listItem') {
        const candidateDepth = getListItemDepth(view.state.doc, candidate.pos + 1);
        const hitDepth = getListItemDepth(view.state.doc, hit.pos + 1);
        if (candidateDepth > hitDepth) {
          hit = candidate;
        }
      }
    }
    if (hit) {
      break;
    }
  }

  if (!hit) {
    if (DEBUG.enabled) {
      DEBUG.warn(MODULE, 'Handle target not found (elementsFromPoint)', {
        x,
        y,
        samples: debugSamples,
      });
    }
    return { resultElement: null, resultNode: null, pos: null };
  }

  return { resultElement: hit.element, resultNode: hit.node, pos: hit.pos };
};

const resolveListItemPosFromCoords = (
  view: EditorView,
  doc: ProseMirrorNode,
  x: number,
  y: number
): number | null => {
  const viewRect = view.dom.getBoundingClientRect();
  const clamped = clampPointToRect(viewRect, x, y, 2);
  const offsets = [0, LIST_INDENT_STEP_PX, LIST_INDENT_STEP_PX * 2, LIST_INDENT_STEP_PX * 3];
  let best: { pos: number; depth: number } | null = null;

  for (const offset of offsets) {
    const sampleX = Math.min(viewRect.right - 2, clamped.x + offset);
    const elements = getElementsFromPoint(view, sampleX, clamped.y);
    for (const el of elements) {
      if (!view.dom.contains(el)) {
        continue;
      }
      if (isOverlayElement(el)) {
        continue;
      }
      const listItemPos = resolveListItemPosFromElement(view, el);
      if (listItemPos === null) {
        continue;
      }
      const depth = getListItemDepth(doc, listItemPos + 1);
      if (!best || depth > best.depth) {
        best = { pos: listItemPos, depth };
      }
    }
    if (best) {
      break;
    }
  }

  return best?.pos ?? null;
};

const resolveListItemTextPos = (doc: ProseMirrorNode, listItemPos: number): number | null => {
  const listItem = doc.nodeAt(listItemPos);
  if (!listItem) {
    return null;
  }
  let offset = 0;
  for (let i = 0; i < listItem.childCount; i += 1) {
    const child = listItem.child(i);
    if (child.isTextblock) {
      return listItemPos + 1 + offset + 1;
    }
    offset += child.nodeSize;
  }
  return listItemPos + 1;
};

export const InlineDragHandle = Extension.create<InlineDragHandleOptions>({
  name: 'inlineDragHandle',

  addOptions() {
    return {
      render() {
        const el = document.createElement('div');
        el.classList.add('block-handle-container');
        return el;
      },
      computePositionConfig: {},
      locked: false,
      allowedNodeTypes: undefined,
      onNodeChange: () => {
        return null;
      },
      onElementDragStart: undefined,
      onElementDragEnd: undefined,
    } as InlineDragHandleOptions;
  },

  addCommands() {
    return {
      lockDragHandle:
        () =>
        ({ editor }) => {
          return editor.commands.setMeta('lockDragHandle', true);
        },
      unlockDragHandle:
        () =>
        ({ editor }) => {
          return editor.commands.setMeta('lockDragHandle', false);
        },
      toggleDragHandle:
        () =>
        ({ state, editor }) => {
          const pluginState = InlineDragHandlePluginKey.getState(state) as PluginState | undefined;
          const nextLocked = !(pluginState?.locked ?? false);
          return editor.commands.setMeta('lockDragHandle', nextLocked);
        },
    };
  },

  addProseMirrorPlugins() {
    const element = this.options.render();
    const editor = this.editor;
    const options = this.options;
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-handle-layer';
    wrapper.setAttribute('contenteditable', 'false');
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.pointerEvents = 'none';
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    let locked = false;
    let currentNode: ProseMirrorNode | null = null;
    let currentNodePos = -1;
    let rafId: number | null = null;
    let pendingMouseCoords: { x: number; y: number } | null = null;
    let dragIndentState: { startX: number; sourceDepth: number; startedAt: number } | null = null;
    let pendingDropX: number | null = null;
    let pendingDropCoords: { x: number; y: number } | null = null;
    let indentRafId: number | null = null;
    let dropcursorRafId: number | null = null;
    let handleVisible = false;
    let lastNoTargetLogAt = 0;
    let handleLayerMounted = false;
    let dropFinalizePending = false;
    let eventTarget: HTMLElement | null = null;
    let domListenersBound = false;

    const resolveHandleSafeZone = (): { left: number; right: number; top: number; bottom: number; gutter: number } => {
      const container = editor.view.dom.closest('.editor-container') as HTMLElement | null;
      const rect = container ? container.getBoundingClientRect() : editor.view.dom.getBoundingClientRect();
      let gutter = 0;

      if (container) {
        const styles = window.getComputedStyle(container);
        const gutterValue = styles.getPropertyValue('--block-handle-gutter').trim();
        const parsedGutter = Number.parseFloat(gutterValue);
        if (Number.isFinite(parsedGutter)) {
          gutter = parsedGutter;
        } else {
          const paddingLeft = Number.parseFloat(styles.paddingLeft || '0');
          if (Number.isFinite(paddingLeft)) {
            gutter = paddingLeft;
          }
        }
      }

      const margin = 8;
      return {
        left: rect.left - margin,
        right: rect.right + margin,
        top: rect.top - margin,
        bottom: rect.bottom + margin,
        gutter,
      };
    };

    const hideHandle = (reason?: string, data?: Record<string, unknown>) => {
      element.style.visibility = 'hidden';
      element.style.pointerEvents = 'none';
      wrapper.style.pointerEvents = 'none';
      if (handleVisible) {
        handleVisible = false;
        logWarning('Handle hidden', { reason, ...data });
      }
    };

    const showHandle = (reason?: string, data?: Record<string, unknown>) => {
      if (!editor.isEditable) {
        hideHandle('editor-not-editable');
        return;
      }
      if (!wrapper.isConnected) {
        logError('Handle layer not connected');
        return;
      }
      element.style.visibility = '';
      element.style.pointerEvents = 'auto';
      wrapper.style.pointerEvents = 'auto';
      if (!handleVisible) {
        handleVisible = true;
        logInfo('Handle shown', { reason, ...data });
      }
    };

    const reposition = (dom: HTMLElement, node: ProseMirrorNode | null) => {
      if (!wrapper.isConnected) {
        logError('Handle layer not connected (reposition skipped)');
        return;
      }
      const listItem = node?.type.name === 'listItem' ? resolveListItem(dom) : null;
      const tableCell = resolveTableCell(dom);
      const placement = options.computePositionConfig?.placement;
      const strategy = options.computePositionConfig?.strategy ?? defaultComputePositionConfig.strategy;

      if (node?.type.name === 'listItem' && !listItem) {
        DEBUG.error(MODULE, 'List item handle anchor not found');
        logError('List item handle anchor not found');
        hideHandle();
        return;
      }

      if (tableCell) {
        hideHandle();
        return;
      }

      const virtualElement = options.getReferencedVirtualElement?.() || {
        getBoundingClientRect: () => dom.getBoundingClientRect(),
      };

      computePosition(virtualElement, element, {
        ...defaultComputePositionConfig,
        ...options.computePositionConfig,
        placement: placement ?? defaultComputePositionConfig.placement,
        strategy,
      }).then((val) => {
        let nextX = val.x;
        let nextY = val.y;

        if (listItem) {
          const offset = resolveListOffsetX(listItem);
          if (offset === null) {
            DEBUG.error(MODULE, 'List marker offset not resolved', { node: node?.type.name });
            logError('List marker offset not resolved', { node: node?.type.name });
            hideHandle();
            return;
          }
          nextX -= offset;
        }

        Object.assign(element.style, {
          position: val.strategy,
          left: `${nextX}px`,
          top: `${nextY}px`,
        });
      });
    };

    const readDropcursorBase = (
      dropcursor: HTMLElement
    ): { baseLeft: number; baseWidth: number; viewRect: DOMRect } | null => {
      const viewRect = editor.view.dom.getBoundingClientRect();
      let baseLeft = Number.parseFloat(dropcursor.style.left);
      let baseWidth = Number.parseFloat(dropcursor.style.width);

      if (!Number.isFinite(baseLeft) || !Number.isFinite(baseWidth)) {
        const rect = dropcursor.getBoundingClientRect();
        baseLeft = rect.left - viewRect.left;
        baseWidth = rect.width;
      }

      if (!Number.isFinite(baseLeft) || !Number.isFinite(baseWidth)) {
        return null;
      }

      return { baseLeft, baseWidth, viewRect };
    };

    const restoreDropcursorBase = (dropcursor: HTMLElement): void => {
      const baseLeft = dropcursor.dataset.baseLeft;
      const baseWidth = dropcursor.dataset.baseWidth;
      if (baseLeft !== undefined) {
        dropcursor.style.left = baseLeft;
      }
      if (baseWidth !== undefined) {
        dropcursor.style.width = baseWidth;
      }
      delete dropcursor.dataset.baseLeft;
      delete dropcursor.dataset.baseWidth;
    };

    const applyDropcursorIndent = (clientX: number, clientY: number): void => {
      if (!dragIndentState) {
        return;
      }

      const dropcursor = editor.view.dom.querySelector(DROPCURSOR_SELECTOR) as HTMLElement | null;
      if (!dropcursor) {
        return;
      }

      const baseMetrics = readDropcursorBase(dropcursor);
      if (!baseMetrics) {
        return;
      }

      dropcursor.dataset.baseLeft = `${baseMetrics.baseLeft}px`;
      dropcursor.dataset.baseWidth = `${baseMetrics.baseWidth}px`;

      const listItemPos = resolveListItemPosFromCoords(editor.view, editor.state.doc, clientX, clientY);
      if (listItemPos === null) {
        restoreDropcursorBase(dropcursor);
        return;
      }

      const listItemDom = editor.view.nodeDOM(listItemPos) as HTMLElement | null;
      if (!listItemDom) {
        restoreDropcursorBase(dropcursor);
        return;
      }

      const textStartX = resolveListItemTextStartX(listItemDom);
      if (textStartX === null) {
        restoreDropcursorBase(dropcursor);
        return;
      }

      const deltaPx = clientX - textStartX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));
      const indentPx = deltaDepth * LIST_INDENT_STEP_PX;

      if (indentPx === 0) {
        restoreDropcursorBase(dropcursor);
        return;
      }

      const baseRight = baseMetrics.baseLeft + baseMetrics.baseWidth;
      const textStartLeft = textStartX - baseMetrics.viewRect.left;
      const desiredLeft = textStartLeft + indentPx;
      const clampedLeft = Math.min(Math.max(desiredLeft, 0), baseRight);
      const nextWidth = Math.max(0, baseRight - clampedLeft);

      dropcursor.style.left = `${clampedLeft}px`;
      dropcursor.style.width = `${nextWidth}px`;
    };

    const scheduleDropcursorIndentUpdate = (clientX: number, clientY: number): void => {
      if (dropcursorRafId) {
        cancelAnimationFrame(dropcursorRafId);
      }
      dropcursorRafId = requestAnimationFrame(() => {
        dropcursorRafId = null;
        applyDropcursorIndent(clientX, clientY);
      });
    };

    const clearDragIndentState = (reason?: string): void => {
      dragIndentState = null;
      pendingDropX = null;
      pendingDropCoords = null;
      dropFinalizePending = false;
      if (reason) {
        DEBUG.log(MODULE, 'Drag indent state cleared', { reason });
      }
    };

    const restoreDropcursorAfterIndent = (): void => {
      const dropcursor = editor.view.dom.querySelector(DROPCURSOR_SELECTOR) as HTMLElement | null;
      if (dropcursor) {
        restoreDropcursorBase(dropcursor);
      }
    };

    const adjustListIndentAfterDrop = () => {
      if (!dragIndentState || pendingDropX === null) {
        if (dropFinalizePending) {
          DEBUG.error(MODULE, 'List indent adjust skipped: missing drag state');
          logError('List indent adjust skipped: missing drag state');
          clearDragIndentState('missing-state');
        }
        return;
      }

      const { startX, sourceDepth, startedAt } = dragIndentState;
      const dropX = pendingDropX;
      const dropCoords = pendingDropCoords;
      clearDragIndentState('adjust-drop');
      const durationMs = Date.now() - startedAt;

    const listItemPos = (dropCoords
        ? resolveListItemPosFromCoords(editor.view, editor.state.doc, dropCoords.x, dropCoords.y)
        : null)
        ?? findNearestListItemPos(editor.state.doc, editor.state.selection.from);
      if (listItemPos === null) {
        DEBUG.error(MODULE, 'List indent adjust failed: no listItem near selection');
        logError('List indent adjust failed: no listItem near selection');
        restoreDropcursorAfterIndent();
        return;
      }

      const listItemNode = editor.state.doc.nodeAt(listItemPos);
      if (!listItemNode) {
        DEBUG.error(MODULE, 'List indent adjust failed: listItem node missing');
        logError('List indent adjust failed: listItem node missing');
        restoreDropcursorAfterIndent();
        return;
      }

      const listItemType = editor.state.schema.nodes.listItem;
      if (!listItemType) {
        DEBUG.error(MODULE, 'List indent adjust failed: listItem node missing');
        logError('List indent adjust failed: listItem node missing');
        restoreDropcursorAfterIndent();
        return;
      }

      const insidePos = resolveListItemTextPos(editor.state.doc, listItemPos) ?? listItemPos + 1;
      const $listItem = editor.view.nodeDOM(listItemPos) as HTMLElement | null;
      const baseX = $listItem ? resolveListItemTextStartX($listItem) : null;
      const anchorX = baseX ?? startX;
      const deltaPx = dropX - anchorX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));
      let desiredDepth = Math.max(1, sourceDepth + deltaDepth);
      const maxDepth = LIST_MAX_DEPTH;

      logInfo('List drag indent adjust start', {
        sourceDepth,
        desiredDepth,
        startX,
        dropX,
        durationMs,
      });

      if (desiredDepth > maxDepth) {
        logWarning('List indent blocked: max depth', { desiredDepth, maxDepth, sourceDepth });
        notifyHostWarn(
          'LIST_INDENT_MAX_DEPTH',
          `リストのインデントは最大 ${maxDepth} 段までです。`,
          { desiredDepth, maxDepth, sourceDepth }
        );
        desiredDepth = maxDepth;
      }

      if (deltaDepth === 0) {
        logInfo('List drag indent noop', { sourceDepth, desiredDepth, durationMs });
        restoreDropcursorAfterIndent();
        return;
      }

      const $inside = editor.state.doc.resolve(insidePos);
      const nextSelection = Selection.findFrom($inside, 1, true) ?? Selection.near($inside, 1);
      if (!nextSelection) {
        DEBUG.error(MODULE, 'List indent adjust failed: selection not found');
        logError('List indent adjust failed: selection not found');
        restoreDropcursorAfterIndent();
        return;
      }

      if (nextSelection.from <= listItemPos || nextSelection.to >= listItemPos + listItemNode.nodeSize) {
        DEBUG.error(MODULE, 'List indent adjust failed: selection escaped listItem', {
          listItemPos,
          selectionFrom: nextSelection.from,
          selectionTo: nextSelection.to,
        });
        logError('List indent adjust failed: selection escaped listItem', {
          listItemPos,
          selectionFrom: nextSelection.from,
          selectionTo: nextSelection.to,
        });
        restoreDropcursorAfterIndent();
        return;
      }

      editor.view.dispatch(editor.state.tr.setSelection(nextSelection));

      const getCurrentDepth = () => getListItemDepth(editor.state.doc, editor.state.selection.from);

      let currentDepth = getCurrentDepth();

      if (currentDepth === desiredDepth) {
        logInfo('List drag indent noop', { sourceDepth, desiredDepth, durationMs });
        return;
      }

      if (desiredDepth > currentDepth) {
        while (currentDepth < desiredDepth) {
          const ok = sinkListItem(listItemType)(editor.state, editor.view.dispatch);
          if (!ok) {
            const $pos = editor.state.doc.resolve(listItemPos);
            const index = $pos.index();
            logWarning('List indent sink blocked', {
              currentDepth,
              desiredDepth,
              listItemPos,
              selectionFrom: editor.state.selection.from,
              selectionTo: editor.state.selection.to,
              isFirstItem: index === 0,
            });
            DEBUG.warn(MODULE, 'List indent sink blocked', { currentDepth, desiredDepth });
            break;
          }
          currentDepth = getCurrentDepth();
        }
        if (currentDepth === desiredDepth) {
          logSuccess('List indent sink applied', { finalDepth: currentDepth, durationMs });
        } else {
          logWarning('List indent sink incomplete', { finalDepth: currentDepth, desiredDepth, durationMs });
        }
        restoreDropcursorAfterIndent();
        return;
      }

      while (currentDepth > desiredDepth) {
        const ok = liftListItem(listItemType)(editor.state, editor.view.dispatch);
        if (!ok) {
          DEBUG.warn(MODULE, 'List indent lift blocked', { currentDepth, desiredDepth });
          logWarning('List indent lift blocked', { currentDepth, desiredDepth });
          break;
        }
        currentDepth = getCurrentDepth();
      }
      if (currentDepth === desiredDepth) {
        logSuccess('List indent lift applied', { finalDepth: currentDepth, durationMs });
      } else {
        logWarning('List indent lift incomplete', { finalDepth: currentDepth, desiredDepth, durationMs });
      }
      restoreDropcursorAfterIndent();
    };

    const onKeydown = () => {
      if (!element || locked) {
        return;
      }

      if (editor.view.hasFocus()) {
        hideHandle('view-focus');
        currentNode = null;
        currentNodePos = -1;
        options.onNodeChange?.({ editor, node: null, pos: -1 });
      }
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (locked) return;

      const related = e.relatedTarget as HTMLElement | null;
      const container = eventTarget ?? (editor.view.dom.closest('.editor-container') as HTMLElement | null);
      if (
        related &&
        (editor.view.dom.contains(related) ||
          wrapper.contains(related) ||
          element.contains(related) ||
          (container ? container.contains(related) : false))
      ) {
        return;
      }

      const zone = resolveHandleSafeZone();
      const withinZone =
        Number.isFinite(e.clientX) &&
        Number.isFinite(e.clientY) &&
        e.clientX >= zone.left &&
        e.clientX <= zone.right &&
        e.clientY >= zone.top &&
        e.clientY <= zone.bottom;

      if (withinZone) {
        DEBUG.log(MODULE, 'Handle hide skipped (safe zone)', {
          clientX: e.clientX,
          clientY: e.clientY,
          zone,
        });
        return;
      }

      if (currentNodePos !== -1) {
        logWarning('Handle hide skipped (keep current)', {
          clientX: e.clientX,
          clientY: e.clientY,
          relatedTag: related?.tagName,
          zone,
        });
        return;
      }

      if (e.target) {
        hideHandle('mouseleave', {
          clientX: e.clientX,
          clientY: e.clientY,
          relatedTag: related?.tagName,
          zone,
        });
        currentNode = null;
        currentNodePos = -1;
        options.onNodeChange?.({ editor, node: null, pos: -1 });
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!element || locked) {
        return;
      }

      pendingMouseCoords = { x: e.clientX, y: e.clientY };

      if (rafId) {
        return;
      }

      rafId = requestAnimationFrame(() => {
        rafId = null;

        if (!pendingMouseCoords) {
          return;
        }

        const { x, y } = pendingMouseCoords;
        pendingMouseCoords = null;

        const result = findElementNextToCoords({
          x,
          y,
          editor,
          allowedNodeTypes: options.allowedNodeTypes,
        });

        if (!result.resultElement || !result.resultNode || result.pos === null) {
          const now = Date.now();
          if (now - lastNoTargetLogAt > 2000) {
            lastNoTargetLogAt = now;
            logWarning('Handle target not found', { x, y });
          }
          // Keep last handle visible to avoid flicker in gutter areas
          return;
        }

        if (result.pos !== currentNodePos || !handleVisible) {
          currentNode = result.resultNode;
          currentNodePos = result.pos;
          options.onNodeChange?.({ editor, node: currentNode, pos: currentNodePos });
          reposition(result.resultElement, currentNode);
          showHandle('mousemove', { nodeType: currentNode.type.name, pos: currentNodePos });
        }
      });
    };

    const onDragOver = (e: DragEvent) => {
      if (!dragIndentState) {
        return;
      }
      scheduleDropcursorIndentUpdate(e.clientX, e.clientY);
    };

    const onDrop = (e: DragEvent) => {
      if (!dragIndentState) {
        return;
      }

      pendingDropX = e.clientX;
      pendingDropCoords = { x: e.clientX, y: e.clientY };
      dropFinalizePending = true;
      logInfo('Drag drop captured', { dropX: pendingDropX });

      scheduleDropcursorIndentUpdate(e.clientX, e.clientY);

      if (indentRafId) {
        cancelAnimationFrame(indentRafId);
      }

      indentRafId = requestAnimationFrame(() => {
        indentRafId = null;
        adjustListIndentAfterDrop();
      });
    };

    const bindDomEvents = () => {
      if (domListenersBound) {
        return;
      }
      eventTarget = editor.view.dom.closest('.editor-container') as HTMLElement | null;
      if (!eventTarget) {
        eventTarget = editor.view.dom;
      }
      eventTarget.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
      eventTarget.addEventListener('mouseleave', onMouseLeave, { capture: true });
      eventTarget.addEventListener('dragover', onDragOver, { capture: true });
      eventTarget.addEventListener('drop', onDrop, { capture: true });
      editor.view.dom.addEventListener('keydown', onKeydown, { capture: true });
      domListenersBound = true;
      logSuccess('Handle DOM listeners bound', { targetTag: eventTarget.tagName });
    };

    const unbindDomEvents = () => {
      if (!domListenersBound || !eventTarget) {
        return;
      }
      eventTarget.removeEventListener('mousemove', onMouseMove, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('mouseleave', onMouseLeave, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('dragover', onDragOver, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('drop', onDrop, { capture: true } as EventListenerOptions);
      editor.view.dom.removeEventListener('keydown', onKeydown, { capture: true } as EventListenerOptions);
      domListenersBound = false;
      logSuccess('Handle DOM listeners unbound', { targetTag: eventTarget.tagName });
      eventTarget = null;
    };

    const onDragStart = (e: DragEvent) => {
      options.onElementDragStart?.(e);
      if (!currentNode || currentNodePos < 0) {
        DEBUG.warn(MODULE, 'Drag start ignored: no active node');
        logWarning('Drag start ignored: no active node');
        e.preventDefault();
        return;
      }

      const selection = NodeSelection.create(editor.state.doc, currentNodePos);
      let slice = selection.content();
      editor.view.dispatch(editor.state.tr.setSelection(selection));

      if (currentNode.type.name === 'listItem') {
        const listItemDom = editor.view.nodeDOM(currentNodePos) as HTMLElement | null;
        const listItem = listItemDom ? resolveListItem(listItemDom) : null;
        const baseX = listItem ? resolveListItemTextStartX(listItem) : null;
        dragIndentState = {
          startX: baseX ?? e.clientX,
          sourceDepth: getListItemDepth(editor.state.doc, currentNodePos + 1),
          startedAt: Date.now(),
        };
      } else {
        dragIndentState = null;
      }

      editor.view.dragging = { slice, move: true };

      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', '');
        e.dataTransfer.effectAllowed = 'move';
      } else {
        logWarning('Drag start: dataTransfer missing');
      }

      element.dataset.dragging = 'true';
      setTimeout(() => {
        element.style.pointerEvents = 'none';
      }, 0);

      logInfo('Drag start', {
        nodeType: currentNode.type.name,
        pos: currentNodePos,
        isListItem: currentNode.type.name === 'listItem',
      });
    };

    const onDragEnd = (e: DragEvent) => {
      options.onElementDragEnd?.(e);
      logInfo('Drag end');
      hideHandle('drag-end');
      element.style.pointerEvents = 'auto';
      element.dataset.dragging = 'false';
      currentNode = null;
      currentNodePos = -1;
      options.onNodeChange?.({ editor, node: null, pos: -1 });
      if (dropFinalizePending || indentRafId) {
        logInfo('Drag end deferred (awaiting drop finalize)');
        return;
      }

      clearDragIndentState('drag-end');
      if (dropcursorRafId) {
        cancelAnimationFrame(dropcursorRafId);
        dropcursorRafId = null;
      }
      const dropcursor = editor.view.dom.querySelector(DROPCURSOR_SELECTOR) as HTMLElement | null;
      if (dropcursor) {
        restoreDropcursorBase(dropcursor);
      }
    };

    element.addEventListener('dragstart', onDragStart);
    element.addEventListener('dragend', onDragEnd);

    wrapper.appendChild(element);

    return [
      new Plugin({
        key: InlineDragHandlePluginKey,
        state: {
          init() {
            return { locked: false } as PluginState;
          },
          apply(tr, value) {
            const isLocked = tr.getMeta('lockDragHandle');
            const hideDragHandle = tr.getMeta('hideDragHandle');

            if (isLocked !== undefined) {
              locked = isLocked as boolean;
            }

            if (hideDragHandle) {
              hideHandle();
              locked = false;
              currentNode = null;
              currentNodePos = -1;
              options.onNodeChange?.({ editor, node: null, pos: -1 });
              return value;
            }

            if (tr.docChanged && currentNodePos !== -1) {
              const mapped = tr.mapping.map(currentNodePos);
              if (mapped !== currentNodePos) {
                currentNodePos = mapped;
              }
            }

            return value;
          },
        },

        view: (view) => {
          element.draggable = true;
          element.style.pointerEvents = 'auto';
          element.dataset.dragging = 'false';
          bindDomEvents();

          requestAnimationFrame(() => {
            if (wrapper.isConnected && !handleLayerMounted) {
              handleLayerMounted = true;
              logSuccess('Handle layer mounted', {
                parentTag: editor.view.dom.tagName,
                childCount: editor.view.dom.children.length,
              });
            }
            if (!wrapper.isConnected) {
              logError('Handle layer mount failed');
            }
          });

          return {
            update(_, oldState) {
              if (!element) return;
              if (!editor.isEditable) {
                hideHandle('editor-not-editable');
                return;
              }
              if (wrapper.isConnected && !handleLayerMounted) {
                handleLayerMounted = true;
                logSuccess('Handle layer mounted', {
                  parentTag: editor.view.dom.tagName,
                  childCount: editor.view.dom.children.length,
                });
              } else if (!wrapper.isConnected && handleLayerMounted) {
                handleLayerMounted = false;
                logError('Handle layer detached');
              }

              element.draggable = !locked;

              if (view.state.doc.eq(oldState.doc) || currentNodePos === -1) {
                return;
              }

              const domNode = view.nodeDOM(currentNodePos) as HTMLElement | null;
              if (!domNode || domNode === view.dom) {
                return;
              }

              const node = view.state.doc.nodeAt(currentNodePos);
              if (!node) {
                hideHandle('node-missing', { pos: currentNodePos });
                currentNode = null;
                currentNodePos = -1;
                options.onNodeChange?.({ editor, node: null, pos: -1 });
                return;
              }

              currentNode = node;
              options.onNodeChange?.({ editor, node: currentNode, pos: currentNodePos });
              reposition(domNode, currentNode);
            },
            destroy() {
              if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                pendingMouseCoords = null;
              }
              if (indentRafId) {
                cancelAnimationFrame(indentRafId);
                indentRafId = null;
              }
              if (dropcursorRafId) {
                cancelAnimationFrame(dropcursorRafId);
                dropcursorRafId = null;
              }
              unbindDomEvents();
              wrapper.remove();
            },
          };
        },
        props: {
          decorations(state) {
            return createHandleLayerDecorations(state.doc, wrapper);
          },
        },
      }),
    ];
  },
});
