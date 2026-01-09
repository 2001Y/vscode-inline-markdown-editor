/**
 * Block Handles Extension for Tiptap
 * Provides Notion-like block manipulation UI:
 * - 6-dot drag handles on the left of each block
 * - Right-click context menu for block operations (delete, move up/down)
 * - Drag and drop for block reordering
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { DEBUG } from './debug.js';

const MODULE = 'BlockHandles';

// Layout constants
const HANDLE_WIDTH = 20;
const HANDLE_OFFSET = 8; // Distance from block edge
const HIDE_DELAY_MS = 100;

export const BlockHandlesPluginKey = new PluginKey('blockHandles');

// Block types that should have handles
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'rawBlock',
  'htmlBlock',
]);

/**
 * Create the handle element
 */
function createBlockHandle(): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'block-handle';
  handle.innerHTML = '⋮⋮';
  handle.title = 'ドラッグで移動 / 右クリックでメニュー';
  handle.draggable = true;
  handle.style.cssText = `
    position: absolute;
    left: 0;
    width: ${HANDLE_WIDTH}px;
    height: 24px;
    cursor: grab;
    font-size: 10px;
    letter-spacing: -2px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease;
    user-select: none;
    border-radius: 3px;
    z-index: 10;
  `;
  return handle;
}

/**
 * Create context menu for block operations
 */
function createBlockContextMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'block-context-menu';
  menu.style.cssText = `
    position: fixed;
    z-index: 1000;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 6px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: none;
    min-width: 140px;
  `;
  return menu;
}

/**
 * Create context menu item
 */
function createMenuItem(label: string, action: string, disabled = false): HTMLElement {
  const item = document.createElement('button');
  item.className = 'block-context-menu-item';
  item.dataset.action = action;
  item.textContent = label;
  item.disabled = disabled;
  item.style.cssText = `
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: ${disabled ? 'var(--vscode-disabledForeground)' : 'var(--vscode-editor-foreground)'};
    text-align: left;
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    font-size: 13px;
    opacity: ${disabled ? '0.5' : '1'};
  `;
  return item;
}

/**
 * Create drop indicator element
 */
function createDropIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
  indicator.style.cssText = `
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--vscode-focusBorder);
    pointer-events: none;
    display: none;
    z-index: 100;
  `;
  return indicator;
}

export interface BlockHandlesOptions {
  // Future options
}

export const BlockHandles = Extension.create<BlockHandlesOptions>({
  name: 'blockHandles',

  addProseMirrorPlugins() {
    const editor = this.editor;
    let handle: HTMLElement | null = null;
    let contextMenu: HTMLElement | null = null;
    let dropIndicator: HTMLElement | null = null;
    let currentBlockElement: HTMLElement | null = null;
    let currentBlockPos: number | null = null;
    let hideTimeoutId: number | null = null;
    let isDragging = false;
    let dragSourcePos: number | null = null;

    const cancelHideTimeout = () => {
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
      }
    };

    const scheduleHide = () => {
      cancelHideTimeout();
      hideTimeoutId = window.setTimeout(() => {
        if (handle && !isDragging) {
          handle.style.opacity = '0';
          handle.style.pointerEvents = 'none';
        }
        currentBlockElement = null;
        currentBlockPos = null;
        hideTimeoutId = null;
      }, HIDE_DELAY_MS);
    };

    const showHandle = () => {
      cancelHideTimeout();
      if (handle) {
        handle.style.opacity = '1';
        handle.style.pointerEvents = 'auto';
      }
    };

    const hideContextMenu = () => {
      if (contextMenu) {
        contextMenu.style.display = 'none';
      }
    };

    const showContextMenu = (x: number, y: number, pos: number, isFirst: boolean, isLast: boolean) => {
      if (!contextMenu) return;

      DEBUG.log(MODULE, 'Showing context menu', { pos, isFirst, isLast });
      contextMenu.innerHTML = '';

      contextMenu.appendChild(createMenuItem('上に移動', 'moveUp', isFirst));
      contextMenu.appendChild(createMenuItem('下に移動', 'moveDown', isLast));

      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background: var(--vscode-editorWidget-border); margin: 4px 0;';
      contextMenu.appendChild(separator);

      contextMenu.appendChild(createMenuItem('ブロックを削除', 'delete'));

      // Position menu in viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 150;
      const menuHeight = 100;

      let menuX = x;
      let menuY = y;

      if (x + menuWidth > viewportWidth) {
        menuX = viewportWidth - menuWidth - 10;
      }
      if (y + menuHeight > viewportHeight) {
        menuY = viewportHeight - menuHeight - 10;
      }

      contextMenu.style.left = `${menuX}px`;
      contextMenu.style.top = `${menuY}px`;
      contextMenu.style.display = 'block';
    };

    /**
     * Find the block node at a given DOM position
     */
    const findBlockAtPos = (view: EditorView, domPos: { x: number; y: number }): { pos: number; node: ProseMirrorNode; dom: HTMLElement } | null => {
      const posInfo = view.posAtCoords({ left: domPos.x, top: domPos.y });
      if (!posInfo) return null;

      // Walk up from the position to find the top-level block
      let pos = posInfo.pos;
      const doc = view.state.doc;

      // Find the resolved position
      const $pos = doc.resolve(pos);

      // Get the top-level block (depth 1)
      if ($pos.depth < 1) return null;

      // Get the parent at depth 1 (direct child of doc)
      const nodePos = $pos.before(1);
      const node = $pos.node(1);

      // Get the DOM element for this node
      const dom = view.nodeDOM(nodePos) as HTMLElement | null;
      if (!dom) return null;

      return { pos: nodePos, node, dom };
    };

    /**
     * Move block up or down
     */
    const moveBlock = (direction: 'up' | 'down') => {
      if (currentBlockPos === null) return;

      const { state, dispatch } = editor.view;
      const { tr, doc } = state;

      const $pos = doc.resolve(currentBlockPos);
      if ($pos.depth < 1) return;

      const nodePos = $pos.before(1);
      const node = $pos.node(1);
      const nodeSize = node.nodeSize;

      if (direction === 'up' && nodePos > 0) {
        // Find previous sibling
        const prevNodeEnd = nodePos;
        const $prev = doc.resolve(prevNodeEnd - 1);
        const prevNodePos = $prev.before(1);

        // Delete current node and insert before previous
        const newTr = tr
          .delete(nodePos, nodePos + nodeSize)
          .insert(prevNodePos, node);

        dispatch(newTr);
        DEBUG.log(MODULE, 'Moved block up', { from: nodePos, to: prevNodePos });
      } else if (direction === 'down') {
        const nextNodePos = nodePos + nodeSize;
        if (nextNodePos < doc.content.size) {
          const $next = doc.resolve(nextNodePos);
          const nextNode = $next.nodeAfter;

          if (nextNode) {
            // Delete current node and insert after next
            const newTr = tr
              .delete(nodePos, nodePos + nodeSize)
              .insert(nodePos + nextNode.nodeSize - nodeSize, node);

            dispatch(newTr);
            DEBUG.log(MODULE, 'Moved block down', { from: nodePos });
          }
        }
      }
    };

    /**
     * Delete block
     */
    const deleteBlock = () => {
      if (currentBlockPos === null) return;

      const { state, dispatch } = editor.view;
      const { tr, doc } = state;

      const $pos = doc.resolve(currentBlockPos);
      if ($pos.depth < 1) return;

      const nodePos = $pos.before(1);
      const node = $pos.node(1);
      const nodeSize = node.nodeSize;

      dispatch(tr.delete(nodePos, nodePos + nodeSize));
      DEBUG.log(MODULE, 'Deleted block', { pos: nodePos });
    };

    const handleContextMenuAction = (action: string) => {
      switch (action) {
        case 'moveUp':
          moveBlock('up');
          break;
        case 'moveDown':
          moveBlock('down');
          break;
        case 'delete':
          deleteBlock();
          break;
      }
      hideContextMenu();
    };

    /**
     * Update handle position for a block
     */
    const updateHandlePosition = (view: EditorView, blockElement: HTMLElement) => {
      if (!handle) return;

      const editorContainer = view.dom.closest('.editor-container') as HTMLElement;
      if (!editorContainer) return;

      const blockRect = blockElement.getBoundingClientRect();
      const containerRect = editorContainer.getBoundingClientRect();

      // Position handle to the left of the block
      const left = blockRect.left - containerRect.left - HANDLE_WIDTH - HANDLE_OFFSET + editorContainer.scrollLeft;
      const top = blockRect.top - containerRect.top + editorContainer.scrollTop;

      handle.style.left = `${left}px`;
      handle.style.top = `${top}px`;
    };

    return [
      new Plugin({
        key: BlockHandlesPluginKey,
        view(view) {
          DEBUG.log(MODULE, 'Plugin initialized');

          const editorContainer = view.dom.closest('.editor-container') as HTMLElement;
          if (!editorContainer) {
            DEBUG.warn(MODULE, 'Editor container not found');
            return { destroy() {} };
          }

          // Create handle
          handle = createBlockHandle();
          handle.style.pointerEvents = 'none';
          editorContainer.style.position = 'relative';
          editorContainer.appendChild(handle);

          // Create context menu
          contextMenu = createBlockContextMenu();
          document.body.appendChild(contextMenu);

          // Create drop indicator
          dropIndicator = createDropIndicator();
          editorContainer.appendChild(dropIndicator);

          // Mouse move handler
          const onMouseMove = (e: MouseEvent) => {
            if (isDragging) return;

            const target = e.target as HTMLElement;

            // Ignore if mouse is on handle or context menu
            if (target.closest('.block-handle') || target.closest('.block-context-menu')) {
              return;
            }

            // Ignore if mouse is on table (TableControls handles tables)
            if (target.closest('table')) {
              scheduleHide();
              return;
            }

            const blockInfo = findBlockAtPos(view, { x: e.clientX, y: e.clientY });
            if (blockInfo && BLOCK_TYPES.has(blockInfo.node.type.name)) {
              // Skip if it's a table
              if (blockInfo.node.type.name === 'table') {
                scheduleHide();
                return;
              }

              currentBlockElement = blockInfo.dom;
              currentBlockPos = blockInfo.pos;
              updateHandlePosition(view, blockInfo.dom);
              showHandle();
            } else {
              scheduleHide();
            }
          };

          // Handle mouse enter/leave
          const onHandleMouseEnter = () => {
            cancelHideTimeout();
            showHandle();
          };

          const onHandleMouseLeave = () => {
            if (!isDragging) {
              scheduleHide();
            }
          };

          // Handle right-click
          const onHandleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            if (currentBlockPos === null) return;

            const doc = view.state.doc;
            const $pos = doc.resolve(currentBlockPos);
            const nodePos = $pos.before(1);

            // Check if first or last block
            const isFirst = nodePos === 0;
            const isLast = nodePos + $pos.node(1).nodeSize >= doc.content.size;

            showContextMenu(e.clientX, e.clientY, currentBlockPos, isFirst, isLast);
          };

          // Context menu click handler
          const onContextMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('block-context-menu-item') && !target.hasAttribute('disabled')) {
              e.preventDefault();
              e.stopPropagation();
              const action = target.dataset.action;
              if (action) {
                handleContextMenuAction(action);
              }
            }
          };

          // Close context menu on document click
          const onDocumentClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.block-context-menu')) {
              hideContextMenu();
            }
          };

          // Drag start handler
          const onDragStart = (e: DragEvent) => {
            if (currentBlockPos === null || !currentBlockElement) return;

            isDragging = true;
            dragSourcePos = currentBlockPos;

            // Set drag data
            e.dataTransfer?.setData('text/plain', '');
            e.dataTransfer!.effectAllowed = 'move';

            // Create drag image
            const dragImage = currentBlockElement.cloneNode(true) as HTMLElement;
            dragImage.style.cssText = `
              position: absolute;
              top: -9999px;
              left: -9999px;
              opacity: 0.7;
              background: var(--vscode-editor-background);
              border: 1px solid var(--vscode-focusBorder);
              border-radius: 4px;
              padding: 4px;
              max-width: 300px;
              overflow: hidden;
            `;
            document.body.appendChild(dragImage);
            e.dataTransfer?.setDragImage(dragImage, 10, 10);
            setTimeout(() => dragImage.remove(), 0);

            // Add dragging class to source
            currentBlockElement.classList.add('is-dragging');
            DEBUG.log(MODULE, 'Drag started', { pos: dragSourcePos });
          };

          // Drag over handler
          const onDragOver = (e: DragEvent) => {
            if (!isDragging || dragSourcePos === null) return;

            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';

            const blockInfo = findBlockAtPos(view, { x: e.clientX, y: e.clientY });
            if (blockInfo && dropIndicator) {
              const rect = blockInfo.dom.getBoundingClientRect();
              const containerRect = editorContainer.getBoundingClientRect();
              const midY = rect.top + rect.height / 2;

              // Show indicator above or below based on mouse position
              const indicatorTop = e.clientY < midY
                ? rect.top - containerRect.top + editorContainer.scrollTop
                : rect.bottom - containerRect.top + editorContainer.scrollTop;

              dropIndicator.style.top = `${indicatorTop}px`;
              dropIndicator.style.display = 'block';
            }
          };

          // Drag leave handler
          const onDragLeave = () => {
            if (dropIndicator) {
              dropIndicator.style.display = 'none';
            }
          };

          // Drop handler
          const onDrop = (e: DragEvent) => {
            e.preventDefault();
            if (!isDragging || dragSourcePos === null) return;

            if (dropIndicator) {
              dropIndicator.style.display = 'none';
            }

            const blockInfo = findBlockAtPos(view, { x: e.clientX, y: e.clientY });
            if (blockInfo) {
              const { state, dispatch } = view;
              const { tr, doc } = state;

              const $sourcePos = doc.resolve(dragSourcePos);
              const sourceNodePos = $sourcePos.before(1);
              const sourceNode = $sourcePos.node(1);
              const sourceNodeSize = sourceNode.nodeSize;

              const targetPos = blockInfo.pos;
              const targetRect = blockInfo.dom.getBoundingClientRect();
              const insertBefore = e.clientY < targetRect.top + targetRect.height / 2;

              // Calculate insert position
              let insertPos: number;
              if (insertBefore) {
                insertPos = targetPos;
              } else {
                insertPos = targetPos + blockInfo.node.nodeSize;
              }

              // Adjust for deletion
              if (sourceNodePos < insertPos) {
                insertPos -= sourceNodeSize;
              }

              if (sourceNodePos !== insertPos) {
                const newTr = tr
                  .delete(sourceNodePos, sourceNodePos + sourceNodeSize)
                  .insert(insertPos, sourceNode);
                dispatch(newTr);
                DEBUG.log(MODULE, 'Block dropped', { from: sourceNodePos, to: insertPos });
              }
            }

            // Reset drag state
            isDragging = false;
            dragSourcePos = null;
            if (currentBlockElement) {
              currentBlockElement.classList.remove('is-dragging');
            }
          };

          // Drag end handler
          const onDragEnd = () => {
            isDragging = false;
            dragSourcePos = null;
            if (dropIndicator) {
              dropIndicator.style.display = 'none';
            }
            if (currentBlockElement) {
              currentBlockElement.classList.remove('is-dragging');
            }
            scheduleHide();
          };

          // Scroll handler
          const onScroll = () => {
            if (currentBlockElement && handle?.style.opacity === '1') {
              updateHandlePosition(view, currentBlockElement);
            }
          };

          // Add event listeners
          view.dom.addEventListener('mousemove', onMouseMove);
          handle?.addEventListener('mouseenter', onHandleMouseEnter);
          handle?.addEventListener('mouseleave', onHandleMouseLeave);
          handle?.addEventListener('contextmenu', onHandleContextMenu);
          handle?.addEventListener('dragstart', onDragStart);
          editorContainer.addEventListener('dragover', onDragOver);
          editorContainer.addEventListener('dragleave', onDragLeave);
          editorContainer.addEventListener('drop', onDrop);
          handle?.addEventListener('dragend', onDragEnd);
          contextMenu?.addEventListener('click', onContextMenuClick);
          document.addEventListener('click', onDocumentClick);
          editorContainer.addEventListener('scroll', onScroll);

          return {
            update(view) {
              // Update handle position if visible
              if (currentBlockElement && handle?.style.opacity === '1') {
                updateHandlePosition(view, currentBlockElement);
              }
            },
            destroy() {
              DEBUG.log(MODULE, 'Plugin destroyed');
              cancelHideTimeout();
              view.dom.removeEventListener('mousemove', onMouseMove);
              handle?.removeEventListener('mouseenter', onHandleMouseEnter);
              handle?.removeEventListener('mouseleave', onHandleMouseLeave);
              handle?.removeEventListener('contextmenu', onHandleContextMenu);
              handle?.removeEventListener('dragstart', onDragStart);
              editorContainer.removeEventListener('dragover', onDragOver);
              editorContainer.removeEventListener('dragleave', onDragLeave);
              editorContainer.removeEventListener('drop', onDrop);
              handle?.removeEventListener('dragend', onDragEnd);
              contextMenu?.removeEventListener('click', onContextMenuClick);
              document.removeEventListener('click', onDocumentClick);
              editorContainer.removeEventListener('scroll', onScroll);
              handle?.remove();
              contextMenu?.remove();
              dropIndicator?.remove();
            },
          };
        },
      }),
    ];
  },
});
