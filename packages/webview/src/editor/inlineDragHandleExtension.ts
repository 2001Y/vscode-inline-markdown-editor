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
import type { EditorView } from '@tiptap/pm/view';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import {
  computePosition,
  type ComputePositionConfig,
  type VirtualElement,
} from '@floating-ui/dom';
import { DEBUG } from './debug.js';

const MODULE = 'InlineDragHandle';
const TABLE_CELL_SELECTOR = 'td, th';
const LIST_CONTAINER_SELECTOR = 'ul, ol';
const LIST_INDENT_STEP_PX = 24;
const LIST_MARKER_GAP_PX = 6;

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

const clampToContent = (view: EditorView, x: number, y: number, inset = 5): { x: number; y: number } => {
  const container = view.dom;
  const firstBlock = container.firstElementChild as HTMLElement | null;
  const lastBlock = container.lastElementChild as HTMLElement | null;

  if (!firstBlock || !lastBlock) {
    return { x, y };
  }

  const topRect = firstBlock.getBoundingClientRect();
  const botRect = lastBlock.getBoundingClientRect();
  const clampedY = Math.min(Math.max(topRect.top + inset, y), botRect.bottom - inset);

  const epsilon = 0.5;
  const sameLeft = Math.abs(topRect.left - botRect.left) < epsilon;
  const sameRight = Math.abs(topRect.right - botRect.right) < epsilon;

  const rowRect: DOMRect = topRect;

  if (!sameLeft || !sameRight) {
    // Fallback: keep topRect
  }

  const clampedX = Math.min(Math.max(rowRect.left + inset, x), rowRect.right - inset);

  return { x: clampedX, y: clampedY };
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
  if ((element as HTMLElement).closest(TABLE_CELL_SELECTOR)) {
    return null;
  }

  let current: HTMLElement | null = element as HTMLElement;
  const allowed = allowedNodeTypes;

  while (current && current !== view.dom) {
    let pos: number | null = null;
    try {
      pos = view.posAtDOM(current, 0);
    } catch {
      pos = null;
    }

    if (pos !== null && pos >= 0) {
      const $pos = view.state.doc.resolve(pos);

      if (allowed?.has('listItem')) {
        for (let depth = $pos.depth; depth >= 1; depth--) {
          if ($pos.node(depth).type.name === 'listItem') {
            const node = $pos.node(depth);
            const nodePos = $pos.before(depth);
            const nodeDom = view.nodeDOM(nodePos) as HTMLElement | null;
            if (nodeDom && nodeDom !== view.dom) {
              return { element: nodeDom, node, pos: nodePos };
            }
            break;
          }
        }
      }

      const nodeAfter = $pos.nodeAfter;
      if (nodeAfter && allowed?.has(nodeAfter.type.name)) {
        const nodePos = $pos.pos;
        const nodeDom = view.nodeDOM(nodePos) as HTMLElement | null;
        if (nodeDom && nodeDom !== view.dom) {
          return { element: nodeDom, node: nodeAfter, pos: nodePos };
        }
      }

      const nodeBefore = $pos.nodeBefore;
      if (nodeBefore && allowed?.has(nodeBefore.type.name)) {
        const nodePos = $pos.pos - nodeBefore.nodeSize;
        const nodeDom = view.nodeDOM(nodePos) as HTMLElement | null;
        if (nodeDom && nodeDom !== view.dom) {
          return { element: nodeDom, node: nodeBefore, pos: nodePos };
        }
      }

      for (let depth = $pos.depth; depth >= 1; depth--) {
        const node = $pos.node(depth);
        if (allowed && !allowed.has(node.type.name)) {
          continue;
        }
        const nodePos = $pos.before(depth);
        const nodeDom = view.nodeDOM(nodePos) as HTMLElement | null;
        if (nodeDom && nodeDom !== view.dom) {
          return { element: nodeDom, node, pos: nodePos };
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
  const { x: clampedX, y: clampedY } = clampToContent(view, x, y, 5);

  const elements = view.root.elementsFromPoint(clampedX, clampedY);
  let hit: { element: HTMLElement; node: ProseMirrorNode; pos: number } | null = null;

  Array.prototype.some.call(elements, (el: Element) => {
    if (!view.dom.contains(el)) {
      return false;
    }
    const candidate = findClosestAllowedNode(el, view, allowedNodeTypes);
    if (candidate) {
      hit = candidate;
      return true;
    }
    return false;
  });

  if (!hit) {
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
  const { x: clampedX, y: clampedY } = clampToContent(view, x, y, 4);
  const coords = view.posAtCoords({ left: clampedX, top: clampedY });
  if (!coords) {
    return null;
  }
  return findNearestListItemPos(doc, coords.pos);
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
    let locked = false;
    let currentNode: ProseMirrorNode | null = null;
    let currentNodePos = -1;
    let rafId: number | null = null;
    let pendingMouseCoords: { x: number; y: number } | null = null;
    let dragIndentState: { startX: number; sourceDepth: number; startedAt: number } | null = null;
    let pendingDropX: number | null = null;
    let pendingDropCoords: { x: number; y: number } | null = null;
    let indentRafId: number | null = null;
    const indentIndicator = document.createElement('div');
    indentIndicator.className = 'list-indent-indicator';

    const hideHandle = () => {
      element.style.visibility = 'hidden';
      element.style.pointerEvents = 'none';
    };

    const hideIndentIndicator = () => {
      indentIndicator.classList.remove('is-visible');
    };

    const updateIndentIndicator = (clientX: number, clientY: number) => {
      if (!dragIndentState) {
        hideIndentIndicator();
        return;
      }

      const listItemPos = resolveListItemPosFromCoords(editor.view, editor.state.doc, clientX, clientY);
      const targetDom = listItemPos !== null ? (editor.view.nodeDOM(listItemPos) as HTMLElement | null) : null;
      const targetBaseX = targetDom ? resolveListItemTextStartX(targetDom) : null;
      const anchorX = targetBaseX ?? dragIndentState.startX;
      const deltaPx = clientX - dragIndentState.startX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));

      if (deltaDepth === 0) {
        hideIndentIndicator();
        return;
      }

      const indentX = anchorX + deltaDepth * LIST_INDENT_STEP_PX;
      const { x: clampedX, y: clampedY } = clampToContent(editor.view, clientX, clientY, 4);
      const coords = editor.view.posAtCoords({ left: clampedX, top: clampedY });
      if (!coords) {
        hideIndentIndicator();
        return;
      }
      const caret = editor.view.coordsAtPos(coords.pos);
      const height = Math.max(12, caret.bottom - caret.top);
      indentIndicator.style.setProperty('--indent-x', `${indentX}px`);
      indentIndicator.style.setProperty('--indent-y', `${caret.top}px`);
      indentIndicator.style.setProperty('--indent-h', `${height}px`);
      indentIndicator.classList.add('is-visible');
    };

    const showHandle = () => {
      if (!editor.isEditable) {
        hideHandle();
        return;
      }
      element.style.visibility = '';
      element.style.pointerEvents = 'auto';
    };

    const reposition = (dom: HTMLElement, node: ProseMirrorNode | null) => {
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

    const adjustListIndentAfterDrop = () => {
      if (!dragIndentState || pendingDropX === null) {
        return;
      }

      const { startX, sourceDepth, startedAt } = dragIndentState;
      const dropX = pendingDropX;
      const dropCoords = pendingDropCoords;
      dragIndentState = null;
      pendingDropX = null;
      pendingDropCoords = null;
      const durationMs = Date.now() - startedAt;

      const listItemPos = (dropCoords
        ? resolveListItemPosFromCoords(editor.view, editor.state.doc, dropCoords.x, dropCoords.y)
        : null)
        ?? findNearestListItemPos(editor.state.doc, editor.state.selection.from);
      if (listItemPos === null) {
        DEBUG.error(MODULE, 'List indent adjust failed: no listItem near selection');
        logError('List indent adjust failed: no listItem near selection');
        return;
      }

      const listItemNode = editor.state.doc.nodeAt(listItemPos);
      if (!listItemNode) {
        DEBUG.error(MODULE, 'List indent adjust failed: listItem node missing');
        logError('List indent adjust failed: listItem node missing');
        return;
      }

      const listItemType = editor.state.schema.nodes.listItem;
      if (!listItemType) {
        DEBUG.error(MODULE, 'List indent adjust failed: listItem node missing');
        logError('List indent adjust failed: listItem node missing');
        return;
      }

      const insidePos = resolveListItemTextPos(editor.state.doc, listItemPos) ?? listItemPos + 1;
      const $listItem = editor.view.nodeDOM(listItemPos) as HTMLElement | null;
      const baseX = $listItem ? resolveListItemTextStartX($listItem) : null;
      const anchorX = baseX ?? startX;
      const deltaPx = dropX - anchorX;
      const rawDelta = Math.round(deltaPx / LIST_INDENT_STEP_PX);
      const deltaDepth = Math.max(-1, Math.min(1, rawDelta));
      const desiredDepth = Math.max(1, sourceDepth + deltaDepth);

      logInfo('List drag indent adjust start', {
        sourceDepth,
        desiredDepth,
        startX,
        dropX,
        durationMs,
      });

      if (deltaDepth === 0) {
        logInfo('List drag indent noop', { sourceDepth, desiredDepth, durationMs });
        return;
      }

      const $inside = editor.state.doc.resolve(insidePos);
      const nextSelection = Selection.findFrom($inside, 1, true) ?? Selection.near($inside, 1);
      if (!nextSelection) {
        DEBUG.error(MODULE, 'List indent adjust failed: selection not found');
        logError('List indent adjust failed: selection not found');
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
            DEBUG.warn(MODULE, 'List indent sink blocked', { currentDepth, desiredDepth });
            logWarning('List indent sink blocked', { currentDepth, desiredDepth });
            break;
          }
          currentDepth = getCurrentDepth();
        }
        if (currentDepth === desiredDepth) {
          logSuccess('List indent sink applied', { finalDepth: currentDepth, durationMs });
        } else {
          logWarning('List indent sink incomplete', { finalDepth: currentDepth, desiredDepth, durationMs });
        }
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
        updateIndentIndicator(e.clientX, e.clientY);
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
      hideHandle();
      element.style.pointerEvents = 'auto';
      element.dataset.dragging = 'false';
      dragIndentState = null;
      pendingDropX = null;
      pendingDropCoords = null;
      hideIndentIndicator();
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

          editor.view.dom.parentElement?.appendChild(wrapper);
          editor.view.dom.parentElement?.appendChild(indentIndicator);

          wrapper.style.pointerEvents = 'none';
          wrapper.style.position = 'absolute';
          wrapper.style.top = '0';
          wrapper.style.left = '0';

          return {
            update(_, oldState) {
              if (!element) return;
              if (!editor.isEditable) {
                hideHandle();
                return;
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
                hideHandle();
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
              wrapper.remove();
              indentIndicator.remove();
            },
          };
        },
        props: {
          handleDOMEvents: {
            keydown(view) {
              if (!element || locked) {
                return false;
              }

              if (view.hasFocus()) {
                hideHandle();
                currentNode = null;
                currentNodePos = -1;
                options.onNodeChange?.({ editor, node: null, pos: -1 });
                return false;
              }

              return false;
            },
            mouseleave(_view, e) {
              if (locked) return false;

              if (e.target && !wrapper.contains(e.relatedTarget as HTMLElement)) {
                hideHandle();
                currentNode = null;
                currentNodePos = -1;
                options.onNodeChange?.({ editor, node: null, pos: -1 });
              }

              return false;
            },
            mousemove(view, e) {
              if (!element || locked) {
                return false;
              }

              pendingMouseCoords = { x: e.clientX, y: e.clientY };

              if (rafId) {
                return false;
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
                  hideHandle();
                  currentNode = null;
                  currentNodePos = -1;
                  options.onNodeChange?.({ editor, node: null, pos: -1 });
                  return;
                }

                if (result.pos !== currentNodePos) {
                  currentNode = result.resultNode;
                  currentNodePos = result.pos;
                  options.onNodeChange?.({ editor, node: currentNode, pos: currentNodePos });
                  reposition(result.resultElement, currentNode);
                  showHandle();
                }
              });

              return false;
            },
            drop(_view, e) {
              if (!dragIndentState) {
                return false;
              }

              pendingDropX = e.clientX;
              pendingDropCoords = { x: e.clientX, y: e.clientY };
              logInfo('Drag drop captured', { dropX: pendingDropX });
              updateIndentIndicator(e.clientX, e.clientY);

              if (indentRafId) {
                cancelAnimationFrame(indentRafId);
              }

              indentRafId = requestAnimationFrame(() => {
                indentRafId = null;
                adjustListIndentAfterDrop();
                hideIndentIndicator();
              });

              return false;
            },
            dragover(_view, e) {
              if (!dragIndentState) {
                return false;
              }
              updateIndentIndicator(e.clientX, e.clientY);
              return false;
            },
          },
        },
      }),
    ];
  },
});
