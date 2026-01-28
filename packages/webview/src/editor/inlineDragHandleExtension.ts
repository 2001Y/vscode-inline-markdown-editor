/**
 * Inline Drag Handle Extension (block-embedded handles)
 *
 * 役割: ブロックごとにハンドルを埋め込み、ドラッグ開始と補助線制御を提供
 * 方針: 絶対配置レイヤーを廃止し、各ブロック内にハンドルを配置する
 * 不変条件: table はドラッグ対象外。失敗は隠さずログに残す。
 */

import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, NodeSelection, Selection } from '@tiptap/pm/state';
import { dropPoint } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { isNodeRangeSelection, NodeRangeSelection } from '@tiptap/extension-node-range';
import { DEBUG } from './debug.js';
import { notifyHostWarn } from './hostNotifier.js';
import { INDENT_LEVEL_MAX, INDENT_MAX_DEPTH_MESSAGE, normalizeIndentAttr } from './indentConfig.js';
import { LIST_MAX_DEPTH } from './listIndentConfig.js';
import { createDragHandleElement } from './blockHandlesExtension.js';

const MODULE = 'InlineDragHandle';
const TABLE_CELL_SELECTOR = 'td, th';
const LIST_INDENT_STEP_PX = 24;
const DROPCURSOR_SELECTOR = '.inline-markdown-dropcursor, .ProseMirror-dropcursor';
const HANDLE_CONTAINER_SELECTOR = '.block-handle-container';
const HANDLE_SELECTOR = '.block-handle';
const HANDLE_NODEVIEW_EXCLUSIONS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'codeBlock',
  'table',
  'rawBlock',
  'frontmatterBlock',
  'plainTextBlock',
  'nestedPage',
  'horizontalRule',
]);
const NOOP_TOLERANCE_POS = 1;

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
  locked?: boolean;
  allowedNodeTypes?: Set<string>;
  onNodeChange?: (options: { node: ProseMirrorNode | null; editor: Editor; pos: number }) => void;
  onElementDragStart?: (e: DragEvent) => void;
  onElementDragEnd?: (e: DragEvent) => void;
}

type PluginState = {
  locked: boolean;
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

const resolveListItem = (element: HTMLElement): HTMLElement | null => {
  return element.closest('li') as HTMLElement | null;
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

const isIndentableNode = (node: ProseMirrorNode | null | undefined): boolean => {
  if (!node?.isBlock) {
    return false;
  }
  if (node.type.name === 'listItem') {
    return false;
  }
  if (node.type.spec.tableRole || node.type.name === 'table') {
    return false;
  }
  return true;
};

const resolveIndentableBlockFromSelection = (editor: Editor): { pos: number; node: ProseMirrorNode } | null => {
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection && isIndentableNode(selection.node)) {
    return { pos: selection.from, node: selection.node };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (!isIndentableNode(node)) {
      continue;
    }
    return { pos: $from.before(depth), node };
  }
  return null;
};

const resolveBlockTextStartX = (element: HTMLElement): number | null => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const paddingValue = style.paddingInlineStart || style.paddingLeft || '0';
  const padding = Number.parseFloat(paddingValue);
  if (!Number.isFinite(rect.left)) {
    return null;
  }
  return rect.left + (Number.isFinite(padding) ? Math.max(0, padding) : 0);
};

const createHandleDecorations = (
  doc: ProseMirrorNode,
  options: InlineDragHandleOptions,
  reportCount?: (
    count: number,
    stats?: {
      blockTypes: string[];
      childCount: number;
      docSize: number;
      allExcluded?: boolean;
      handleTypes?: Record<string, number>;
      excludedTypes?: Record<string, number>;
      skippedReasons?: Record<string, number>;
    }
  ) => void
): DecorationSet => {
  const decorations: Decoration[] = [];
  const allowed = options.allowedNodeTypes;
  const blockTypes = new Set<string>();
  let handleCount = 0;
  const handleTypes: Record<string, number> = {};
  const excludedTypes: Record<string, number> = {};
  const skippedReasons: Record<string, number> = {};
  const allExcluded =
    Boolean(allowed) &&
    Array.from(allowed.values()).every((typeName) => HANDLE_NODEVIEW_EXCLUSIONS.has(typeName));

  const bump = (target: Record<string, number>, key: string) => {
    target[key] = (target[key] ?? 0) + 1;
  };

  doc.descendants((node, pos, parent) => {
    if (node.isBlock) {
      blockTypes.add(node.type.name);
    }
    if (node.type.spec.tableRole || node.type.name === 'table') {
      bump(skippedReasons, 'table');
      return false;
    }
    if (parent?.type.spec.tableRole) {
      bump(skippedReasons, 'tableChild');
      return false;
    }
    if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
      bump(skippedReasons, 'listContainer');
      return true;
    }
    if (parent?.type.name === 'listItem' && node.type.name !== 'listItem') {
      bump(skippedReasons, 'listItemChild');
      return false;
    }
    if (node.type.name === 'listItem') {
      for (let i = 0; i < node.childCount; i += 1) {
        if (node.child(i).type.name === 'plainTextBlock') {
          bump(skippedReasons, 'listItemPlainText');
          return false;
        }
      }
    }
    if (HANDLE_NODEVIEW_EXCLUSIONS.has(node.type.name)) {
      bump(skippedReasons, 'nodeViewExcluded');
      bump(excludedTypes, node.type.name);
      return false;
    }

    const isAllowed = allowed ? allowed.has(node.type.name) : node.isBlock;
    if (!isAllowed) {
      bump(skippedReasons, 'notAllowed');
      bump(excludedTypes, node.type.name);
      return true;
    }

    const hostAttrs = {
      class: 'block-handle-host',
    };
    decorations.push(Decoration.node(pos, pos + node.nodeSize, hostAttrs));

    const widgetPos = Math.min(pos + 1, pos + Math.max(1, node.nodeSize - 1));
    decorations.push(
      Decoration.widget(
        widgetPos,
        () => {
          const handle = options.render ? options.render() : createDragHandleElement();
          handle.classList.add('block-handle-container');
          handle.setAttribute('contenteditable', 'false');
          handle.setAttribute('data-block-pos', String(pos));
          handle.setAttribute('data-block-type', node.type.name);
          handle.draggable = false;
          return handle;
        },
        {
          key: `block-handle-${pos}`,
          ignoreSelection: true,
          stopEvent: (event) => {
            const target = event.target as HTMLElement | null;
            if (!target) {
              return false;
            }
            const isHandleEvent = Boolean(target.closest(HANDLE_CONTAINER_SELECTOR));
            if (!isHandleEvent) {
              return false;
            }
            if (
              event.type === 'dragover' ||
              event.type === 'dragenter' ||
              event.type === 'drop' ||
              event.type === 'dragstart'
            ) {
              return false;
            }
            return true;
          },
        }
      )
    );
    handleCount += 1;
    bump(handleTypes, node.type.name);

    return node.type.name === 'listItem';
  });

  if (reportCount) {
    reportCount(handleCount, {
      blockTypes: Array.from(blockTypes.values()),
      childCount: doc.childCount,
      docSize: doc.content.size,
      allExcluded,
      handleTypes,
      excludedTypes,
      skippedReasons,
    });
  }

  return DecorationSet.create(doc, decorations);
};

export const InlineDragHandle = Extension.create<InlineDragHandleOptions>({
  name: 'inlineDragHandle',

  addOptions() {
    return {
      render: () => createDragHandleElement(),
      locked: false,
      allowedNodeTypes: undefined,
      onNodeChange: undefined,
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
    const editor = this.editor;
    const options = this.options;
    let locked = false;
    let dragSelectionRange: { from: number; to: number; size: number } | null = null;
    let dragPayload: { slice: unknown; move: boolean } | null = null;
    let dragIndentState: { startX: number; sourceDepth: number; startedAt: number; sourcePos: number } | null = null;
    let blockIndentState: { startX: number; sourceIndent: number; startedAt: number; sourcePos: number } | null = null;
    let pendingDropX: number | null = null;
    let pendingDropCoords: { x: number; y: number } | null = null;
    let pendingBlockDropX: number | null = null;
    let pendingBlockDropCoords: { x: number; y: number } | null = null;
    let indentRafId: number | null = null;
    let dropcursorRafId: number | null = null;
    let dropFinalizePending = false;
    let eventTarget: HTMLElement | null = null;
    let domListenersBound = false;
    let documentListenersBound = false;
    let lastHandleCount = -1;
    let lastNoopState: boolean | null = null;
    let lastDropTargetLogAt = 0;
    let lastDomHandleCount = -1;
    let dropHandled = false;
    let dragSourceElement: HTMLElement | null = null;
    let dragStartedAt: number | null = null;
    let lastDragOverLogAt = 0;
    let lastDragOverCoords: { x: number; y: number } | null = null;
    let lastDragOverTarget: number | null = null;

    const setHandleLockClass = () => {
      editor.view.dom.classList.toggle('is-handle-locked', locked);
    };

    const resolveHandleTarget = (target: EventTarget | null): {
      node: ProseMirrorNode;
      pos: number;
      container: HTMLElement;
      handle: HTMLElement;
    } | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }
      const handle = target.closest(HANDLE_SELECTOR) as HTMLElement | null;
      if (!handle) {
        return null;
      }
      const container = handle.closest(HANDLE_CONTAINER_SELECTOR) as HTMLElement | null;
      if (!container) {
        return null;
      }
      const resolveBlockPosFromContainer = (): number | null => {
        const rawPos = Number(container.dataset.blockPos);
        const rawPosValid = Number.isFinite(rawPos);
        let resolvedPos = rawPosValid ? rawPos : null;
        const domPos = safePosAtDOM(editor.view, container);
        if (domPos !== null) {
          const $pos = editor.state.doc.resolve(domPos);
          const desiredType = container.dataset.blockType;
          for (let depth = $pos.depth; depth >= 0; depth -= 1) {
            const node = $pos.node(depth);
            if (desiredType) {
              if (node.type.name !== desiredType) {
                continue;
              }
            } else if (!node.isBlock) {
              continue;
            }
            resolvedPos = depth === 0 ? 0 : $pos.before(depth);
            break;
          }
        }
        if (resolvedPos !== null) {
          if (rawPosValid && resolvedPos !== rawPos) {
            logInfo('Handle dataset pos corrected', {
              rawPos,
              resolvedPos,
              blockType: container.dataset.blockType ?? null,
            });
          }
          container.dataset.blockPos = String(resolvedPos);
        }
        return resolvedPos;
      };

      const posValue = resolveBlockPosFromContainer();
      if (posValue === null || !Number.isFinite(posValue)) {
        logError('Handle target missing position', { dataset: { ...container.dataset } });
        return null;
      }
      const node = editor.state.doc.nodeAt(posValue);
      if (!node || node.isText) {
        logError('Handle target disallowed', { pos: posValue, type: node?.type?.name ?? 'unknown' });
        return null;
      }
      if (options.allowedNodeTypes && !options.allowedNodeTypes.has(node.type.name)) {
        logWarning('Handle target disallowed', { pos: posValue, type: node.type.name });
        return null;
      }
      return { node, pos: posValue, container, handle };
    };

    const resolveHandleContainer = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }
      return target.closest(HANDLE_CONTAINER_SELECTOR) as HTMLElement | null;
    };

    const resolveDropcursorElements = (): NodeListOf<HTMLElement> => {
      const root = editor.view.root as Document | ShadowRoot | HTMLElement;
      if (root && 'querySelectorAll' in root) {
        return (root as Document | ShadowRoot).querySelectorAll(DROPCURSOR_SELECTOR) as NodeListOf<HTMLElement>;
      }
      return editor.view.dom.querySelectorAll(DROPCURSOR_SELECTOR) as NodeListOf<HTMLElement>;
    };

    const isElementInDragSource = (el: Element): boolean => {
      if (!dragSourceElement) {
        return false;
      }
      return dragSourceElement.contains(el);
    };

    const setDropcursorNoop = (isNoop: boolean): void => {
      const dropcursors = resolveDropcursorElements();
      if (!dropcursors.length) {
        return;
      }
      dropcursors.forEach((dropcursor) => {
        if (isNoop) {
          dropcursor.classList.add('is-noop');
        } else {
          dropcursor.classList.remove('is-noop');
        }
      });
    };

    const resolveDropTargetPos = (clientX: number, clientY: number): number | null => {
      const viewRect = editor.view.dom.getBoundingClientRect();
      const clamped = clampPointToRect(viewRect, clientX, clientY, 2);
      const elements = getElementsFromPoint(editor.view, clamped.x, clamped.y);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) {
          continue;
        }
        if (!editor.view.dom.contains(el)) {
          continue;
        }
        if (el === editor.view.dom) {
          continue;
        }
        if (isElementInDragSource(el)) {
          continue;
        }
        if (el.closest(HANDLE_CONTAINER_SELECTOR)) {
          continue;
        }
        if (el.classList.contains('inline-markdown-dropcursor') || el.classList.contains('ProseMirror-dropcursor')) {
          continue;
        }
        if (el.closest(TABLE_CELL_SELECTOR)) {
          continue;
        }
        const blockHost = el.closest('.block-handle-host') as HTMLElement | null;
        if (blockHost) {
          if (blockHost.tagName === 'LI') {
            continue;
          }
          const pos = safePosAtDOM(editor.view, blockHost);
          if (pos !== null) {
            return pos;
          }
        }
      }

      const coords = editor.view.posAtCoords({ left: clamped.x, top: clamped.y });
      if (!coords) {
        return null;
      }
      let target = coords.pos;
      const draggingSlice = editor.view.dragging?.slice;
      if (draggingSlice) {
        const point = dropPoint(editor.state.doc, target, draggingSlice);
        if (point !== null) {
          target = point;
        }
      }
      return target;
    };

    const resolveBlockHostFromCoords = (clientX: number, clientY: number): HTMLElement | null => {
      const viewRect = editor.view.dom.getBoundingClientRect();
      const clamped = clampPointToRect(viewRect, clientX, clientY, 2);
      const elements = getElementsFromPoint(editor.view, clamped.x, clamped.y);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) {
          continue;
        }
        if (!editor.view.dom.contains(el)) {
          continue;
        }
        if (el === editor.view.dom) {
          continue;
        }
        if (isElementInDragSource(el)) {
          continue;
        }
        if (el.closest(HANDLE_CONTAINER_SELECTOR)) {
          continue;
        }
        if (el.classList.contains('inline-markdown-dropcursor') || el.classList.contains('ProseMirror-dropcursor')) {
          continue;
        }
        if (el.closest(TABLE_CELL_SELECTOR)) {
          continue;
        }
        const host = el.closest('.block-handle-host') as HTMLElement | null;
        if (host) {
          return host;
        }
      }
      return null;
    };

    const simulateDropNoop = (target: number, slice: any, move: boolean): boolean | null => {
      try {
        let insertPos = target;
        let tr = editor.state.tr;
        const originalDoc = tr.doc;

        if (move) {
          tr = tr.deleteSelection();
        }

        insertPos = tr.mapping.map(insertPos);
        const drop = dropPoint(tr.doc, insertPos, slice);
        if (drop !== null) {
          insertPos = drop;
        }

        const isNode = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
        if (isNode) {
          tr = tr.replaceRangeWith(insertPos, insertPos, slice.content.firstChild!);
        } else {
          tr = tr.replaceRange(insertPos, insertPos, slice);
        }

        return tr.doc.eq(originalDoc);
      } catch (error) {
        logWarning('Dropcursor noop simulation failed', { error: String(error) });
        return null;
      }
    };

    const updateDropcursorNoopState = (clientX: number, clientY: number): void => {
      if (!dragSelectionRange) {
        if (DEBUG.enabled && editor.view.dragging) {
          DEBUG.warn(MODULE, 'Dropcursor noop skipped: missing dragSelectionRange');
        }
        setDropcursorNoop(false);
        return;
      }
      const target = resolveDropTargetPos(clientX, clientY);
      if (target === null) {
        const now = Date.now();
        if (now - lastDropTargetLogAt > 2000) {
          lastDropTargetLogAt = now;
          const rect = editor.view.dom.getBoundingClientRect();
          const payload = {
            clientX,
            clientY,
            viewRect: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
            },
          };
          logWarning('Dropcursor target resolve failed', payload);
          if (DEBUG.enabled) {
            DEBUG.warn(MODULE, 'Dropcursor target resolve failed', payload);
          }
        }
        setDropcursorNoop(false);
        return;
      }
      const { from, to, size } = dragSelectionRange;
      const withinRange = (value: number) =>
        value >= from - NOOP_TOLERANCE_POS && value <= to + NOOP_TOLERANCE_POS;
      let isNoop = withinRange(target);
      let adjustedTarget: number | null = null;
      if (!isNoop && size > 0 && target > to) {
        adjustedTarget = target - size;
        isNoop = withinRange(adjustedTarget);
      }
      let listTargetPos: number | null = null;
      if (dragIndentState) {
        listTargetPos = resolveListItemPosFromCoords(editor.view, editor.state.doc, clientX, clientY);
        if (listTargetPos !== null) {
          const sameItem = listTargetPos === dragIndentState.sourcePos;
          isNoop = sameItem;
        }
      }
      let simulatedNoop = false;
      let simulatedUsed = false;
      const dragging = editor.view.dragging;
      if (dragging?.slice && dragging.move) {
        const shouldSimulate = dragIndentState !== null || !isNoop;
        if (shouldSimulate) {
          const simulated = simulateDropNoop(target, dragging.slice, Boolean(dragging.move));
          if (simulated !== null) {
            simulatedNoop = simulated;
            simulatedUsed = true;
            if (dragIndentState) {
              if (listTargetPos === null) {
                isNoop = simulatedNoop;
              }
            } else if (!isNoop && simulatedNoop) {
              isNoop = true;
            }
          }
        }
      }
      if (DEBUG.enabled && lastNoopState !== isNoop) {
        DEBUG.log(MODULE, 'Dropcursor noop state updated', {
          isNoop,
          target,
          adjustedTarget,
          simulatedNoop,
          simulatedUsed,
          isListDrag: Boolean(dragIndentState),
          isBlockDrag: Boolean(blockIndentState),
          listTargetPos,
          listSourcePos: dragIndentState?.sourcePos ?? null,
          range: { from, to, size },
        });
        lastNoopState = isNoop;
      } else if (!isNoop && withinRange(target)) {
        logWarning('Dropcursor noop mismatch (within tolerance but not applied)', {
          target,
          range: { from, to, size },
          adjustedTarget,
          simulatedNoop,
        });
      }
      setDropcursorNoop(isNoop);
    };

    const isNoopDropTarget = (target: number): { isNoop: boolean; adjustedTarget: number | null } => {
      if (!dragSelectionRange) {
        return { isNoop: false, adjustedTarget: null };
      }
      const { from, to, size } = dragSelectionRange;
      const withinRange = (value: number) =>
        value >= from - NOOP_TOLERANCE_POS && value <= to + NOOP_TOLERANCE_POS;
      let isNoop = withinRange(target);
      let adjustedTarget: number | null = null;
      if (!isNoop && size > 0 && target > to) {
        adjustedTarget = target - size;
        isNoop = withinRange(adjustedTarget);
      }
      return { isNoop, adjustedTarget };
    };

    const applyManualDrop = (clientX: number, clientY: number): boolean => {
      if (!dragSelectionRange) {
        return false;
      }
      const viewAny = editor.view as EditorView & { dragging?: { slice: any; move: boolean } | null };
      const dragging = viewAny.dragging;
      const payload = dragging?.slice ? dragging : dragPayload;
      if (!payload || !payload.slice) {
        logWarning('Manual drop skipped: dragging slice missing', {
          hasDragging: Boolean(dragging),
          hasPayload: Boolean(dragPayload),
        });
        return false;
      }
      const target = resolveDropTargetPos(clientX, clientY);
      if (target === null) {
        logWarning('Manual drop skipped: target resolve failed', { clientX, clientY });
        return false;
      }
      const { isNoop, adjustedTarget } = isNoopDropTarget(target);
      let finalNoop = isNoop;
      let simulatedNoop: boolean | null = null;
      let listTargetPos: number | null = null;
      if (dragIndentState) {
        listTargetPos = resolveListItemPosFromCoords(editor.view, editor.state.doc, clientX, clientY);
        if (listTargetPos !== null) {
          finalNoop = listTargetPos === dragIndentState.sourcePos;
        }
      }
      if (dragging?.slice) {
        simulatedNoop = simulateDropNoop(target, dragging.slice, Boolean(dragging.move));
        if (simulatedNoop !== null) {
          finalNoop = simulatedNoop;
        }
      }
      if (finalNoop) {
        logInfo('Manual drop noop', { target, adjustedTarget, simulatedNoop, listTargetPos });
        return false;
      }

      const slice = payload.slice;
      let tr = editor.state.tr;
      if (payload.move) {
        if (dragSelectionRange) {
          tr = tr.delete(dragSelectionRange.from, dragSelectionRange.to);
        } else {
          tr = tr.deleteSelection();
        }
      }

      let insertPos = tr.mapping.map(target);
      const drop = dropPoint(tr.doc, insertPos, slice);
      if (drop !== null) {
        insertPos = drop;
      }

      const isNode = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
      let insertedNode = null as ProseMirrorNode | null;
      if (isNode) {
        insertedNode = slice.content.firstChild as ProseMirrorNode;
        tr = tr.replaceRangeWith(insertPos, insertPos, insertedNode);
      } else {
        tr = tr.replaceRange(insertPos, insertPos, slice);
      }

      const selectionAnchor =
        insertedNode && insertedNode.type.name === 'listItem'
          ? Math.min(tr.doc.content.size, insertPos + 1)
          : insertPos;
      tr = tr.setSelection(Selection.near(tr.doc.resolve(selectionAnchor), 1)).scrollIntoView();
      editor.view.dispatch(tr);
      logInfo('Manual drop applied', {
        target,
        insertPos,
        selectionAnchor,
        isNode,
        insertedType: insertedNode?.type?.name ?? null,
      });
      return true;
    };

    const applyDropcursorIndent = (clientX: number, clientY: number): void => {
      if (!dragIndentState) {
        return;
      }

      const dropcursor = editor.view.dom.querySelector(DROPCURSOR_SELECTOR) as HTMLElement | null;
      if (!dropcursor) {
        return;
      }

      const viewRect = editor.view.dom.getBoundingClientRect();
      const baseLeft = Number.parseFloat(dropcursor.style.left) || dropcursor.getBoundingClientRect().left - viewRect.left;
      const baseWidth = Number.parseFloat(dropcursor.style.width) || dropcursor.getBoundingClientRect().width;

      if (!Number.isFinite(baseLeft) || !Number.isFinite(baseWidth)) {
        return;
      }

      dropcursor.dataset.baseLeft = `${baseLeft}px`;
      dropcursor.dataset.baseWidth = `${baseWidth}px`;

      const listItemPos = resolveListItemPosFromCoords(editor.view, editor.state.doc, clientX, clientY);
      if (listItemPos === null) {
        return;
      }

      const listItemDom = editor.view.nodeDOM(listItemPos) as HTMLElement | null;
      if (!listItemDom) {
        return;
      }

      const textStartX = resolveListItemTextStartX(listItemDom);
      if (textStartX === null) {
        return;
      }

      const deltaPx = clientX - textStartX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));
      const indentPx = deltaDepth * LIST_INDENT_STEP_PX;

      const baseRight = baseLeft + baseWidth;
      const textStartLeft = textStartX - viewRect.left;
      const desiredLeft = textStartLeft + indentPx;
      const clampedLeft = Math.min(Math.max(desiredLeft, 0), baseRight);
      const nextWidth = Math.max(0, baseRight - clampedLeft);

      dropcursor.style.left = `${clampedLeft}px`;
      dropcursor.style.width = `${nextWidth}px`;
    };

    const applyBlockDropcursorIndent = (clientX: number, clientY: number): void => {
      if (!blockIndentState) {
        return;
      }

      const dropcursor = editor.view.dom.querySelector(DROPCURSOR_SELECTOR) as HTMLElement | null;
      if (!dropcursor) {
        return;
      }

      const viewRect = editor.view.dom.getBoundingClientRect();
      const baseLeft = Number.parseFloat(dropcursor.style.left) || dropcursor.getBoundingClientRect().left - viewRect.left;
      const baseWidth = Number.parseFloat(dropcursor.style.width) || dropcursor.getBoundingClientRect().width;

      if (!Number.isFinite(baseLeft) || !Number.isFinite(baseWidth)) {
        return;
      }

      dropcursor.dataset.baseLeft = `${baseLeft}px`;
      dropcursor.dataset.baseWidth = `${baseWidth}px`;

      const deltaPx = clientX - blockIndentState.startX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));
      const indentPx = deltaDepth * LIST_INDENT_STEP_PX;

      const baseRight = baseLeft + baseWidth;
      const desiredIndent = Math.max(0, Math.min(INDENT_LEVEL_MAX, blockIndentState.sourceIndent + deltaDepth));
      let targetIndent = blockIndentState.sourceIndent;
      const host = resolveBlockHostFromCoords(clientX, clientY);
      if (host) {
        const hostPos = safePosAtDOM(editor.view, host);
        if (hostPos !== null) {
          const node = editor.state.doc.nodeAt(hostPos);
          if (node) {
            targetIndent = normalizeIndentAttr(node.attrs?.indent);
          }
        }
      }
      const indentDelta = desiredIndent - targetIndent;
      const desiredLeft = baseLeft + indentDelta * LIST_INDENT_STEP_PX;
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
        if (dragIndentState) {
          applyDropcursorIndent(clientX, clientY);
        } else if (blockIndentState) {
          applyBlockDropcursorIndent(clientX, clientY);
        }
      });
    };

    const clearDragIndentState = (reason?: string): void => {
      dragIndentState = null;
      blockIndentState = null;
      pendingDropX = null;
      pendingDropCoords = null;
      pendingBlockDropX = null;
      pendingBlockDropCoords = null;
      dropFinalizePending = false;
      if (reason) {
        DEBUG.log(MODULE, 'Drag indent state cleared', { reason });
      }
    };

    const restoreDropcursorAfterIndent = (): void => {
      const dropcursor = editor.view.dom.querySelector(DROPCURSOR_SELECTOR) as HTMLElement | null;
      if (dropcursor) {
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

      const { startX, sourceDepth, startedAt, sourcePos } = dragIndentState;
      const dropX = pendingDropX;
      const dropCoords = pendingDropCoords;
      clearDragIndentState('adjust-drop');
      const durationMs = Date.now() - startedAt;

      const listItemPos = (dropCoords
        ? resolveListItemPosFromCoords(editor.view, editor.state.doc, dropCoords.x, dropCoords.y)
        : null)
        ?? findNearestListItemPos(editor.state.doc, editor.state.selection.from)
        ?? sourcePos;
      if (listItemPos === null) {
        DEBUG.error(MODULE, 'List indent adjust failed: no listItem near selection');
        const selection = editor.state.selection;
        logError('List indent adjust failed: no listItem near selection', {
          selectionFrom: selection.from,
          selectionTo: selection.to,
          selectionEmpty: selection.empty,
          fromParent: selection.$from.parent.type.name,
          toParent: selection.$to.parent.type.name,
          dropCoords,
          pendingDropX,
          docSize: editor.state.doc.content.size,
        });
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
      const listItemDom = editor.view.nodeDOM(listItemPos) as HTMLElement | null;
      const baseX = listItemDom ? resolveListItemTextStartX(listItemDom) : null;
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
          INDENT_MAX_DEPTH_MESSAGE,
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

    const adjustBlockIndentAfterDrop = () => {
      if (!blockIndentState || pendingBlockDropX === null) {
        if (dropFinalizePending) {
          DEBUG.error(MODULE, 'Block indent adjust skipped: missing drag state');
          logError('Block indent adjust skipped: missing drag state');
          clearDragIndentState('missing-block-state');
        }
        return;
      }

      const { startX, sourceIndent, startedAt } = blockIndentState;
      const dropX = pendingBlockDropX;
      clearDragIndentState('adjust-block-drop');
      const durationMs = Date.now() - startedAt;

      const deltaPx = dropX - startX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));
      let desiredIndent = Math.max(0, sourceIndent + deltaDepth);
      const maxDepth = INDENT_LEVEL_MAX;

      if (desiredIndent > maxDepth) {
        logWarning('Block indent blocked: max depth', { desiredIndent, maxDepth, sourceIndent });
        notifyHostWarn('INDENT_MAX_DEPTH', INDENT_MAX_DEPTH_MESSAGE, {
          desiredIndent,
          maxDepth,
          sourceIndent,
        });
        desiredIndent = maxDepth;
      }

      if (deltaDepth === 0) {
        logInfo('Block drag indent noop', { sourceIndent, desiredIndent, durationMs });
        restoreDropcursorAfterIndent();
        return;
      }

      const target = resolveIndentableBlockFromSelection(editor);
      if (!target) {
        DEBUG.error(MODULE, 'Block indent adjust failed: no target');
        logError('Block indent adjust failed: no target', {
          selectionFrom: editor.state.selection.from,
          selectionTo: editor.state.selection.to,
        });
        restoreDropcursorAfterIndent();
        return;
      }

      const currentIndent = normalizeIndentAttr(target.node.attrs?.indent);
      if (currentIndent === desiredIndent) {
        logInfo('Block drag indent noop', { sourceIndent, desiredIndent, durationMs });
        restoreDropcursorAfterIndent();
        return;
      }

      const nextAttrs = { ...target.node.attrs, indent: desiredIndent };
      editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, undefined, nextAttrs));
      logSuccess('Block drag indent applied', { finalIndent: desiredIndent, durationMs });
      restoreDropcursorAfterIndent();
    };

    const resolveDragCoords = (clientX: number, clientY: number): { x: number; y: number } => {
      const viewRect = editor.view.dom.getBoundingClientRect();
      const clamped = clampPointToRect(viewRect, clientX, clientY, 2);
      const elements = getElementsFromPoint(editor.view, clamped.x, clamped.y);
      const hit = elements.find((el) => {
        if (!(el instanceof HTMLElement)) {
          return false;
        }
        if (!editor.view.dom.contains(el)) {
          return false;
        }
        if (isElementInDragSource(el)) {
          return false;
        }
        if (el.closest(HANDLE_CONTAINER_SELECTOR)) {
          return false;
        }
        if (el.classList.contains('inline-markdown-dropcursor') || el.classList.contains('ProseMirror-dropcursor')) {
          return false;
        }
        if (el.closest(TABLE_CELL_SELECTOR)) {
          return false;
        }
        return true;
      }) as HTMLElement | undefined;

      if (hit) {
        const rect = hit.getBoundingClientRect();
        return clampPointToRect(rect, clamped.x, clamped.y, 2);
      }

      return clamped;
    };

    const dispatchDropcursorUpdate = (clientX: number, clientY: number): void => {
      const coords = resolveDragCoords(clientX, clientY);
      updateDropcursorNoopState(coords.x, coords.y);
      const event = new DragEvent('dragover', {
        clientX: coords.x,
        clientY: coords.y,
        bubbles: true,
      });
      editor.view.dom.dispatchEvent(event);
      if (dragIndentState || blockIndentState) {
        scheduleDropcursorIndentUpdate(coords.x, coords.y);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      e.preventDefault();
      const resolvedTarget = resolveDropTargetPos(e.clientX, e.clientY);
      lastDragOverCoords = { x: e.clientX, y: e.clientY };
      lastDragOverTarget = resolvedTarget;
      const now = Date.now();
      if (now - lastDragOverLogAt > 1000) {
        lastDragOverLogAt = now;
        logInfo('Drag over', {
          clientX: e.clientX,
          clientY: e.clientY,
          target: resolvedTarget,
          hasDragSelectionRange: Boolean(dragSelectionRange),
          hasDragIndent: Boolean(dragIndentState),
          hasBlockIndent: Boolean(blockIndentState),
          dragging: Boolean(editor.view.dragging),
          dropHandled,
          dataTransferTypes: e.dataTransfer ? Array.from(e.dataTransfer.types) : [],
        });
      }
      if (!dragIndentState && !blockIndentState) {
        updateDropcursorNoopState(e.clientX, e.clientY);
        return;
      }
      scheduleDropcursorIndentUpdate(e.clientX, e.clientY);
      updateDropcursorNoopState(e.clientX, e.clientY);
    };

    const onDrop = (e: DragEvent) => {
      if (dropHandled) {
        logInfo('Drop ignored: already handled', {
          dropX: e.clientX,
          dropY: e.clientY,
          dragging: Boolean(editor.view.dragging),
        });
        return;
      }
      dropHandled = true;
      lastDragOverCoords = { x: e.clientX, y: e.clientY };
      lastDragOverTarget = resolveDropTargetPos(e.clientX, e.clientY);
      if (!dragSelectionRange) {
        logWarning('Drop received without drag selection range', {
          dropX: e.clientX,
          dropY: e.clientY,
          dragging: Boolean(editor.view.dragging),
        });
      }
      if (dragSelectionRange) {
        const applied = applyManualDrop(e.clientX, e.clientY);
        logInfo('Manual drop evaluated', {
          applied,
          dropX: e.clientX,
          dropY: e.clientY,
          range: dragSelectionRange,
          dragging: Boolean(editor.view.dragging),
        });
        if (applied) {
          e.preventDefault();
          e.stopPropagation();
        } else {
          dropHandled = false;
        }
      }
      if (!dragIndentState && !blockIndentState) {
        logInfo('Drag drop captured (no indent adjust)', {
          dropX: e.clientX,
          dropY: e.clientY,
          hasDragging: Boolean(editor.view.dragging),
        });
        return;
      }
      dropFinalizePending = true;
      if (dragIndentState) {
        pendingDropX = e.clientX;
        pendingDropCoords = { x: e.clientX, y: e.clientY };
        logInfo('Drag drop captured', { dropX: pendingDropX });
      } else if (blockIndentState) {
        pendingBlockDropX = e.clientX;
        pendingBlockDropCoords = { x: e.clientX, y: e.clientY };
        logInfo('Block drag drop captured', { dropX: pendingBlockDropX });
      }

      scheduleDropcursorIndentUpdate(e.clientX, e.clientY);

      if (indentRafId) {
        cancelAnimationFrame(indentRafId);
      }

      indentRafId = requestAnimationFrame(() => {
        indentRafId = null;
        if (dragIndentState) {
          adjustListIndentAfterDrop();
        } else if (blockIndentState) {
          adjustBlockIndentAfterDrop();
        }
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!editor.isEditable) {
        return;
      }
      if (e.button !== 0) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest(HANDLE_CONTAINER_SELECTOR)) {
        return;
      }
      const host = target.closest('.block-handle-host.is-empty') as HTMLElement | null;
      if (!host) {
        return;
      }
      const hostPos = safePosAtDOM(editor.view, host);
      if (hostPos !== null) {
        const $pos = editor.state.doc.resolve(Math.min(hostPos + 1, editor.state.doc.content.size));
        editor.view.dispatch(editor.state.tr.setSelection(Selection.near($pos, 1)));
        logInfo('Placeholder focus forced', { pos: hostPos, targetTag: target.tagName });
        return;
      }
      logError('Placeholder focus resolve failed', { clientX: e.clientX, clientY: e.clientY });
    };

    const onDocumentDragOver = (e: DragEvent) => {
      const hasActiveDrag = Boolean(dragSelectionRange || dragPayload || editor.view.dragging);
      if (!hasActiveDrag) {
        return;
      }
      lastDragOverCoords = { x: e.clientX, y: e.clientY };
      lastDragOverTarget = resolveDropTargetPos(e.clientX, e.clientY);
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      e.preventDefault();
      const inView = editor.view.dom.contains(e.target as Node);
      if (inView) {
        updateDropcursorNoopState(e.clientX, e.clientY);
        return;
      }
      dispatchDropcursorUpdate(e.clientX, e.clientY);
    };

    const onDocumentPointerMove = (e: PointerEvent) => {
      const hasActiveDrag = Boolean(dragSelectionRange || dragPayload || editor.view.dragging);
      if (!hasActiveDrag) {
        return;
      }
      if (editor.view.dom.contains(e.target as Node)) {
        return;
      }
      dispatchDropcursorUpdate(e.clientX, e.clientY);
    };

    const onDocumentDrop = (e: DragEvent) => {
      const hasActiveDrag = Boolean(dragSelectionRange || dragPayload);
      if (dropHandled || !hasActiveDrag) {
        return;
      }
      lastDragOverCoords = { x: e.clientX, y: e.clientY };
      lastDragOverTarget = resolveDropTargetPos(e.clientX, e.clientY);
      logInfo('Document drop captured', {
        dropX: e.clientX,
        dropY: e.clientY,
        targetTag: (e.target as HTMLElement | null)?.tagName,
      });
      onDrop(e);
    };

    const onDocumentDragEnd = (e: DragEvent) => {
      const hasActiveDrag = Boolean(dragSelectionRange || dragPayload);
      if (!hasActiveDrag) {
        return;
      }
      logInfo('Document drag end captured', {
        targetTag: (e.target as HTMLElement | null)?.tagName,
        hasDragging: Boolean(editor.view.dragging),
        hasRange: Boolean(dragSelectionRange),
        hasPayload: Boolean(dragPayload),
      });
      onDragEnd(e);
    };

    const onDragStart = (e: DragEvent) => {
      if (locked || !editor.isEditable) {
        logWarning('Drag start blocked', { locked, editable: editor.isEditable });
        e.preventDefault();
        return;
      }
      const target = resolveHandleTarget(e.target);
      if (!target) {
        const container = resolveHandleContainer(e.target);
        if (container) {
          logWarning('Drag start ignored: handle target not resolved', {
            targetTag: (e.target as HTMLElement | null)?.tagName,
            containerDataset: { ...container.dataset },
          });
        }
        return;
      }

      editor.view.focus();
      options.onElementDragStart?.(e);

      const { node, pos } = target;
      dragStartedAt = Date.now();
      const activeSelection = editor.state.selection;
      let selection: Selection;

      const createRangeSelection = (): Selection | null => {
        try {
          return NodeRangeSelection.create(editor.state.doc, pos, pos + node.nodeSize);
        } catch (error) {
          logWarning('NodeRangeSelection create failed', { pos, error: String(error) });
          return null;
        }
      };

      const createNodeSelection = (): Selection | null => {
        try {
          return NodeSelection.create(editor.state.doc, pos);
        } catch (error) {
          logError('NodeSelection create failed', { pos, error: String(error) });
          return null;
        }
      };

      if (isNodeRangeSelection(activeSelection)) {
        const withinRange = activeSelection.ranges.some(
          (range) => pos >= range.$from.pos && pos < range.$to.pos
        );
        selection = withinRange ? activeSelection : createNodeSelection();
      } else {
        selection = createNodeSelection();
      }

      if (!selection) {
        logError('Drag start aborted: selection unavailable', { pos, nodeType: node.type.name });
        dragStartedAt = null;
        return;
      }

      const activeAfter = selection;
      const slice = activeAfter.content();
      const selectionSize = Math.max(slice.size, activeAfter.to - activeAfter.from);
      dragSelectionRange = { from: activeAfter.from, to: activeAfter.to, size: selectionSize };
      dropHandled = false;
      lastDragOverCoords = null;
      lastDragOverTarget = null;

      const serialized = editor.view.serializeForClipboard ? editor.view.serializeForClipboard(slice) : null;
      const dataTransfer = e.dataTransfer ?? null;
      const beforeTypes = dataTransfer ? Array.from(dataTransfer.types) : [];
      let setDataError: string | null = null;
      let plainTextLength = 0;
      let usedPlainTextFallback = false;
      if (dataTransfer) {
        try {
          if (serialized?.dom) {
            dataTransfer.setData('text/html', serialized.dom.innerHTML);
          }
          const plainTextPayload =
            typeof serialized?.text === 'string' && serialized.text.length > 0 ? serialized.text : ' ';
          plainTextLength = plainTextPayload.length;
          usedPlainTextFallback = plainTextPayload === ' ';
          dataTransfer.setData('text/plain', plainTextPayload);
          dataTransfer.effectAllowed = 'copyMove';
        } catch (error) {
          setDataError = String(error);
          logWarning('Drag start dataTransfer set failed', { error: setDataError });
        }
      }
      const afterTypes = dataTransfer ? Array.from(dataTransfer.types) : [];

      // Ensure ProseMirror drop handler treats this as an internal move.
      const viewAny = editor.view as EditorView & {
        dragging?: { slice: unknown; move: boolean; node?: Selection | null } | null;
      };
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const move = isMac ? !e.altKey : !e.ctrlKey;
      const dragSlice = serialized?.slice ?? slice;
      viewAny.dragging = {
        slice: dragSlice,
        move,
        node: activeAfter instanceof NodeSelection ? activeAfter : null,
      };
      dragPayload = { slice: dragSlice, move };

      if (node.type.name === 'listItem') {
        const listItemDom = editor.view.nodeDOM(pos) as HTMLElement | null;
        const listItem = listItemDom ? resolveListItem(listItemDom) : null;
        const baseX = listItem ? resolveListItemTextStartX(listItem) : null;
        dragIndentState = {
          startX: baseX ?? e.clientX,
          sourceDepth: getListItemDepth(editor.state.doc, pos + 1),
          startedAt: Date.now(),
          sourcePos: pos,
        };
        dragSourceElement = listItem ?? listItemDom ?? null;
        blockIndentState = null;
      } else {
        dragIndentState = null;
        const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
        dragSourceElement =
          dom ?? target.container.closest('.block-handle-host') ?? target.container ?? null;
        if (isIndentableNode(node) && dom) {
          const baseX = resolveBlockTextStartX(dom);
          blockIndentState = {
            startX: baseX ?? e.clientX,
            sourceIndent: normalizeIndentAttr(node.attrs?.indent),
            startedAt: Date.now(),
            sourcePos: pos,
          };
        } else {
          blockIndentState = null;
        }
      }

      logInfo('Drag start', {
        nodeType: node.type.name,
        pos,
        isListItem: node.type.name === 'listItem',
        selection: {
          from: activeAfter.from,
          to: activeAfter.to,
          empty: activeAfter.empty,
          type: activeAfter instanceof NodeSelection ? 'NodeSelection' : activeAfter.constructor?.name ?? 'Selection',
        },
        selectionDispatched: false,
        dragSelectionRange,
        dataTransfer: {
          present: Boolean(dataTransfer),
          beforeTypes,
          afterTypes,
          setDataError,
          plainTextLength,
          usedPlainTextFallback,
        },
        handle: {
          targetTag: (e.target as HTMLElement | null)?.tagName ?? null,
          blockPos: target.container.dataset.blockPos ?? null,
          blockType: target.container.dataset.blockType ?? null,
        },
        move,
        editable: editor.isEditable,
        focused: editor.view.hasFocus(),
      });
    };

    const onDragEnd = (e: DragEvent) => {
      options.onElementDragEnd?.(e);
      const durationMs = dragStartedAt ? Date.now() - dragStartedAt : null;
      dragStartedAt = null;
      const viewAny = editor.view as EditorView & { dragging?: { slice: unknown; move: boolean } | null };
      const rangeAtEnd = dragSelectionRange;
      const draggingSnapshot = viewAny.dragging ?? null;
      logInfo('Drag end', {
        durationMs,
        dropHandled,
        hasRange: Boolean(rangeAtEnd),
        hasDragging: Boolean(draggingSnapshot),
        hasPayload: Boolean(dragPayload),
        lastTarget: lastDragOverTarget,
        lastCoords: lastDragOverCoords,
      });
      setDropcursorNoop(true);

      if (dropFinalizePending || indentRafId) {
        logInfo('Drag end deferred (awaiting drop finalize)', { durationMs });
        dragSelectionRange = null;
        viewAny.dragging = null;
        dragSourceElement = null;
        return;
      }

      const fallbackCoords = lastDragOverCoords ?? (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)
        ? { x: e.clientX, y: e.clientY }
        : null);
      if (!dropHandled && rangeAtEnd && fallbackCoords) {
        logError('Drop missing before drag end; applying manual drop on drag end', {
          durationMs,
          lastTarget: lastDragOverTarget,
          lastCoords: fallbackCoords,
          range: rangeAtEnd,
        });
        const applied = applyManualDrop(fallbackCoords.x, fallbackCoords.y);
        if (applied) {
          dropHandled = true;
        }
        if (!applied) {
          logError('Manual drop failed on drag end', {
            lastTarget: lastDragOverTarget,
            lastCoords: lastDragOverCoords,
            range: rangeAtEnd,
          });
        }
      }

      clearDragIndentState('drag-end');
      if (dropcursorRafId) {
        cancelAnimationFrame(dropcursorRafId);
        dropcursorRafId = null;
      }
      restoreDropcursorAfterIndent();
      dragSelectionRange = null;
      viewAny.dragging = null;
      dragSourceElement = null;
      dragPayload = null;
    };

    const bindDomEvents = () => {
      if (domListenersBound) {
        return;
      }
      eventTarget = editor.view.dom.closest('.editor-container') as HTMLElement | null;
      if (!eventTarget) {
        eventTarget = editor.view.dom;
      }
      eventTarget.addEventListener('dragstart', onDragStart, { capture: true });
      eventTarget.addEventListener('dragend', onDragEnd, { capture: true });
      eventTarget.addEventListener('dragover', onDragOver, { capture: true });
      eventTarget.addEventListener('drop', onDrop, { capture: true });
      eventTarget.addEventListener('mousedown', onMouseDown, { capture: true });
      domListenersBound = true;
      logSuccess('Handle DOM listeners bound', { targetTag: eventTarget.tagName });
    };

    const bindDocumentEvents = () => {
      if (documentListenersBound) {
        return;
      }
      document.addEventListener('dragover', onDocumentDragOver, { capture: true });
      document.addEventListener('pointermove', onDocumentPointerMove, { capture: true, passive: true });
      document.addEventListener('drop', onDocumentDrop, { capture: true });
      document.addEventListener('dragend', onDocumentDragEnd, { capture: true });
      documentListenersBound = true;
      logSuccess('Handle document listeners bound', { targetTag: 'document' });
    };

    const unbindDomEvents = () => {
      if (!domListenersBound || !eventTarget) {
        return;
      }
      eventTarget.removeEventListener('dragstart', onDragStart, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('dragend', onDragEnd, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('dragover', onDragOver, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('drop', onDrop, { capture: true } as EventListenerOptions);
      eventTarget.removeEventListener('mousedown', onMouseDown, { capture: true } as EventListenerOptions);
      domListenersBound = false;
      logSuccess('Handle DOM listeners unbound', { targetTag: eventTarget.tagName });
      eventTarget = null;
    };

    const unbindDocumentEvents = () => {
      if (!documentListenersBound) {
        return;
      }
      document.removeEventListener('dragover', onDocumentDragOver, { capture: true } as EventListenerOptions);
      document.removeEventListener('pointermove', onDocumentPointerMove, { capture: true } as EventListenerOptions);
      document.removeEventListener('drop', onDocumentDrop, { capture: true } as EventListenerOptions);
      document.removeEventListener('dragend', onDocumentDragEnd, { capture: true } as EventListenerOptions);
      documentListenersBound = false;
      logSuccess('Handle document listeners unbound', { targetTag: 'document' });
    };

    return [
      new Plugin({
        key: InlineDragHandlePluginKey,
        state: {
          init() {
            locked = options.locked ?? false;
            return { locked } as PluginState;
          },
          apply(tr, value) {
            const isLocked = tr.getMeta('lockDragHandle');
            const hideDragHandle = tr.getMeta('hideDragHandle');

            if (isLocked !== undefined) {
              locked = isLocked as boolean;
              setHandleLockClass();
            }

            if (hideDragHandle) {
              locked = false;
              setHandleLockClass();
              options.onNodeChange?.({ editor, node: null, pos: -1 });
              return value;
            }

            if (tr.docChanged && dragSelectionRange) {
              const mappedFrom = tr.mapping.map(dragSelectionRange.from);
              const mappedTo = tr.mapping.map(dragSelectionRange.to);
              dragSelectionRange = {
                from: mappedFrom,
                to: mappedTo,
                size: dragSelectionRange.size,
              };
            }

            return value;
          },
        },
        view: () => {
          logInfo('Inline drag handle plugin view init', {
            editable: editor.isEditable,
            allowedNodeTypes: options.allowedNodeTypes ? Array.from(options.allowedNodeTypes.values()) : 'block',
          });
          bindDomEvents();
          bindDocumentEvents();
          setHandleLockClass();

          return {
            update() {
              if (!editor.isEditable) {
                editor.view.dom.classList.add('is-handle-disabled');
              } else {
                editor.view.dom.classList.remove('is-handle-disabled');
              }
              const domCount = editor.view.dom.querySelectorAll(HANDLE_CONTAINER_SELECTOR).length;
              if (domCount !== lastDomHandleCount) {
                logInfo('Handle DOM count updated', {
                  count: domCount,
                  isHandleLocked: editor.view.dom.classList.contains('is-handle-locked'),
                  isHandleDisabled: editor.view.dom.classList.contains('is-handle-disabled'),
                });
                lastDomHandleCount = domCount;
              }
            },
            destroy() {
              if (indentRafId) {
                cancelAnimationFrame(indentRafId);
                indentRafId = null;
              }
              if (dropcursorRafId) {
                cancelAnimationFrame(dropcursorRafId);
                dropcursorRafId = null;
              }
              unbindDomEvents();
              unbindDocumentEvents();
            },
          };
        },
        props: {
          decorations(state) {
            return createHandleDecorations(state.doc, options, (count, stats) => {
              if (count !== lastHandleCount) {
                logInfo('Handle decorations updated', {
                  count,
                  blockTypes: stats?.blockTypes ?? [],
                  docChildCount: stats?.childCount ?? 0,
                  docSize: stats?.docSize ?? 0,
                  handleTypes: stats?.handleTypes ?? {},
                  excludedTypes: stats?.excludedTypes ?? {},
                  skippedReasons: stats?.skippedReasons ?? {},
                });
                if (count === 0 && !stats?.allExcluded) {
                  logWarning('Handle decorations empty', {
                    blockTypes: stats?.blockTypes ?? [],
                    docChildCount: stats?.childCount ?? 0,
                    docSize: stats?.docSize ?? 0,
                    handleTypes: stats?.handleTypes ?? {},
                    excludedTypes: stats?.excludedTypes ?? {},
                    skippedReasons: stats?.skippedReasons ?? {},
                  });
                }
                lastHandleCount = count;
              } else if (DEBUG.enabled) {
                DEBUG.log(MODULE, 'Handle decorations unchanged', { count });
              }
            });
          },
        },
      }),
    ];
  },
});
