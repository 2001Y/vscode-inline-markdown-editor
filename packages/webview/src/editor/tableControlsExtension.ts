/**
 * Table Controls Extension for Tiptap
 * Provides Notion-like UI for table manipulation:
 * - + buttons at table edges for adding rows/columns at the end
 * - Row handles (6-dot grip) on the left of each row for drag reordering
 * - Column handles on top of each column for drag reordering
 * - Right-click context menu for row/column operations
 *
 * Uses fixed positioning (like BlockHandles) to avoid wrapper issues.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Selection } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TableMap, cellAround, findTable, moveTableColumn, moveTableRow } from '@tiptap/pm/tables';
import { t } from './i18n.js';
import { DEBUG } from './debug.js';
import { icons } from './icons.js';
import { createBlockMenu, createBlockMenuItem, createBlockMenuSeparator, updateBlockMenuSelection, getBlockMenuItems, positionBlockMenu } from './blockMenu.js';
import { closeMenu, openMenu, registerMenu, isMenuActive } from './menuManager.js';
import { serializeMarkdown } from './markdownUtils.js';

const MODULE = 'TableControls';

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

export const TableControlsPluginKey = new PluginKey('tableControls');

const ROW_HANDLE_WIDTH = 20;
const COL_HANDLE_HEIGHT = 16;
const HANDLE_DRAG_THRESHOLD_PX = 4;

export const TableControls = Extension.create({
  name: 'tableControls',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: TableControlsPluginKey,
        view(view) {
          DEBUG.log(MODULE, 'Plugin initialized');

          // Create context menu (shared block-menu component)
          const contextMenu = createBlockMenu('tableContext');
          document.body.appendChild(contextMenu);
          DEBUG.log(MODULE, 'Context menu created and appended to body');

          // Create add row/column buttons (fixed position, like BlockHandles)
          const addRowBtn = createAddButton('row');
          const addColBtn = createAddButton('col');
          document.body.appendChild(addRowBtn);
          document.body.appendChild(addColBtn);
          DEBUG.log(MODULE, 'Add buttons created and appended to body');

          // Create row/column handles containers
          const rowHandlesContainer = createRowHandlesContainer();
          const colHandlesContainer = createColHandlesContainer();
          document.body.appendChild(rowHandlesContainer);
          document.body.appendChild(colHandlesContainer);
          DEBUG.log(MODULE, 'Row/col handles containers created');

          // Create drop indicators
          const rowDropIndicator = createTableDropIndicator('row');
          const colDropIndicator = createTableDropIndicator('col');
          document.body.appendChild(rowDropIndicator);
          document.body.appendChild(colDropIndicator);

          let activeTable: HTMLTableElement | null = null;
          let activeRowIndex: number | null = null;
          let activeColIndex: number | null = null;
          let activeCellPos: number | null = null;
          let activeCell: HTMLElement | null = null;
          let isDraggingRow = false;
          let isDraggingCol = false;
          let dragState: {
            axis: 'row' | 'col';
            anchorCellPos: number;
            tablePos: number;
            tableStart: number;
            tableNode: ProseMirrorNode;
            map: TableMap;
            fromIndex: number;
            previewBoundary: number | null;
            handle: HTMLElement;
            startedAt: number;
          } | null = null;
          let pendingHandleAction: {
            axis: 'row' | 'col';
            cellPos: number;
            pointerId: number;
            startX: number;
            startY: number;
            handle: HTMLElement;
            rowIndex: number | null;
            colIndex: number | null;
          } | null = null;
          let menuSelectedIndex = -1;
          let menuItemCount = 0;
          let activePointerId: number | null = null;
          let hideTimeoutId: number | null = null;
          let suppressNextDocumentClick = false;
          const HIDE_DELAY_MS = 150;

          const resolveTableDom = (nodeDom: HTMLElement | null): HTMLTableElement | null => {
            if (!nodeDom) {
              return null;
            }
            if (nodeDom instanceof HTMLTableElement) {
              return nodeDom;
            }
            return nodeDom.querySelector('table');
          };

          /**
           * Resolve cell info from DOM element (hover-based)
           */
          const resolveCellFromDOM = (cellDom: HTMLElement, table: HTMLTableElement) => {
            const row = cellDom.closest('tr') as HTMLTableRowElement | null;
            if (!row) return null;

            const rows = Array.from(table.querySelectorAll('tr'));
            const rowIndex = rows.indexOf(row);
            if (rowIndex < 0) return null;

            const cells = Array.from(row.querySelectorAll('th, td'));
            const colIndex = cells.indexOf(cellDom);
            if (colIndex < 0) return null;

            // Get ProseMirror position for the cell
            const cellStartPos = resolveCellStartPosFromDom(cellDom);

            return {
              table,
              rowIndex,
              colIndex,
              cellDom,
              cellStartPos,
              cellInsidePos: cellStartPos === null ? null : cellStartPos + 1,
            };
          };

          const resolveCellStartPosFromDom = (cellDom: HTMLElement): number | null => {
            try {
              const pos = view.posAtDOM(cellDom, 0);
              if (pos < 0) return null;
              const $pos = view.state.doc.resolve(pos);
              const $cell = cellAround($pos);
              if (!$cell) {
                return null;
              }
              return $cell.pos;
            } catch (err) {
              DEBUG.error(MODULE, 'Cell start position resolve failed', err);
              logError('Cell start position resolve failed');
              return null;
            }
          };

          const resolveCellInsidePosFromDom = (cellDom: HTMLElement): number | null => {
            const startPos = resolveCellStartPosFromDom(cellDom);
            if (startPos === null) return null;
            return startPos + 1;
          };

          const resolveTextSelectionInCell = (cellPos: number): Selection | null => {
            const $pos = view.state.doc.resolve(cellPos);
            return Selection.findFrom($pos, 1, true) ?? Selection.findFrom($pos, -1, true);
          };

          const focusCellSelection = (cellPos: number): boolean => {
            const selection = resolveTextSelectionInCell(cellPos);
            if (!selection) {
              DEBUG.error(MODULE, 'Cell selection resolve failed', { cellPos });
              logError('Cell selection resolve failed', { cellPos });
              return false;
            }
            view.dispatch(view.state.tr.setSelection(selection));
            return true;
          };

          const resolveCellPosFromRow = (table: HTMLTableElement, rowIndex: number): number | null => {
            const rows = table.querySelectorAll('tr');
            const row = rows[rowIndex] as HTMLTableRowElement | undefined;
            if (!row) return null;
            const cell = row.querySelector('td, th') as HTMLElement | null;
            if (!cell) return null;
            return resolveCellStartPosFromDom(cell);
          };

          const resolveCellPosFromCol = (table: HTMLTableElement, colIndex: number): number | null => {
            const firstRow = table.querySelector('tr') as HTMLTableRowElement | null;
            if (!firstRow) return null;
            const cells = firstRow.querySelectorAll('td, th');
            const cell = cells[colIndex] as HTMLElement | undefined;
            if (!cell) return null;
            return resolveCellStartPosFromDom(cell);
          };

          const cancelHideTimeout = () => {
            if (hideTimeoutId !== null) {
              clearTimeout(hideTimeoutId);
              hideTimeoutId = null;
            }
          };

          const scheduleHide = () => {
            cancelHideTimeout();
            hideTimeoutId = window.setTimeout(() => {
              if (isMenuActive('tableContext')) {
                return;
              }
              if (!isDraggingRow && !isDraggingCol) {
                hideControls();
              }
            }, HIDE_DELAY_MS);
          };

          const updateButtonPositions = (tableRect: DOMRect) => {
            const rowBtnX = tableRect.left;
            const rowBtnY = tableRect.bottom - 1;
            addRowBtn.style.setProperty('--btn-x', `${rowBtnX}px`);
            addRowBtn.style.setProperty('--btn-y', `${rowBtnY}px`);
            addRowBtn.style.setProperty('--btn-w', `${tableRect.width}px`);
            addRowBtn.style.setProperty('--btn-h', '20px');

            const colBtnX = tableRect.right - 1;
            const colBtnY = tableRect.top;
            addColBtn.style.setProperty('--btn-x', `${colBtnX}px`);
            addColBtn.style.setProperty('--btn-y', `${colBtnY}px`);
            addColBtn.style.setProperty('--btn-w', '20px');
            addColBtn.style.setProperty('--btn-h', `${tableRect.height}px`);
          };

          const updateRowHandles = (table: HTMLTableElement, rowIndex: number | null) => {
            rowHandlesContainer.innerHTML = '';

            if (rowIndex === null) {
              rowHandlesContainer.classList.remove('is-visible');
              return;
            }

            const rows = table.querySelectorAll('tr');
            const row = rows[rowIndex];
            if (!row) {
              rowHandlesContainer.classList.remove('is-visible');
              return;
            }

            const tableRect = table.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            const cellPos = resolveCellPosFromRow(table, rowIndex);
            if (cellPos === null) {
              DEBUG.error(MODULE, 'Row handle cell pos missing', { rowIndex });
              logError('Row handle cell pos missing', { rowIndex });
              rowHandlesContainer.classList.remove('is-visible');
              return;
            }
            const handle = createRowHandle(rowIndex, cellPos);
            handle.addEventListener('pointerenter', onControlsMouseEnter);
            handle.addEventListener('pointerleave', onControlsMouseLeave);

            const handleX = tableRect.left - ROW_HANDLE_WIDTH - 4;
            const handleY = rowRect.top + (rowRect.height - 20) / 2;

            handle.style.setProperty('--handle-x', `${handleX}px`);
            handle.style.setProperty('--handle-y', `${handleY}px`);

            rowHandlesContainer.appendChild(handle);
            rowHandlesContainer.classList.add('is-visible');
          };

          const updateColHandles = (tableRect: DOMRect, cellRect: DOMRect, colIndex: number | null) => {
            colHandlesContainer.innerHTML = '';

            if (colIndex === null) {
              colHandlesContainer.classList.remove('is-visible');
              return;
            }

            if (!activeTable) {
              colHandlesContainer.classList.remove('is-visible');
              return;
            }
            const cellPos = resolveCellPosFromCol(activeTable, colIndex);
            if (cellPos === null) {
              DEBUG.error(MODULE, 'Column handle cell pos missing', { colIndex });
              logError('Column handle cell pos missing', { colIndex });
              colHandlesContainer.classList.remove('is-visible');
              return;
            }
            const handle = createColHandle(colIndex, cellPos);
            handle.addEventListener('pointerenter', onControlsMouseEnter);
            handle.addEventListener('pointerleave', onControlsMouseLeave);
            const handleX = cellRect.left + (cellRect.width - 24) / 2;
            const handleY = tableRect.top - COL_HANDLE_HEIGHT - 4;

            handle.style.setProperty('--handle-x', `${handleX}px`);
            handle.style.setProperty('--handle-y', `${handleY}px`);

            colHandlesContainer.appendChild(handle);
            colHandlesContainer.classList.add('is-visible');
          };

          const showControls = () => {
            addRowBtn.classList.add('is-visible');
            addColBtn.classList.add('is-visible');
          };

          const hideControls = () => {
            addRowBtn.classList.remove('is-visible');
            addColBtn.classList.remove('is-visible');
            rowHandlesContainer.classList.remove('is-visible');
            colHandlesContainer.classList.remove('is-visible');
            activeTable = null;
            activeRowIndex = null;
            activeColIndex = null;
            activeCellPos = null;
            activeCell = null;
          };

          /**
           * Update controls based on hover position (primary method)
           */
          const updateControlsFromHover = (cellDom: HTMLElement, table: HTMLTableElement) => {
            const cellInfo = resolveCellFromDOM(cellDom, table);
            if (!cellInfo) {
              DEBUG.warn(MODULE, 'Could not resolve cell info from DOM');
              return;
            }

            const { rowIndex, colIndex, cellStartPos, cellInsidePos } = cellInfo;
            const tableRect = table.getBoundingClientRect();
            const cellRect = cellDom.getBoundingClientRect();

            activeTable = table;
            activeRowIndex = rowIndex;
            activeColIndex = colIndex;
            activeCell = cellDom;

            // Use the cell position from DOM, or fall back to trying selection-based
            if (cellStartPos === null || cellInsidePos === null) {
              DEBUG.error(MODULE, 'Cell position not resolved from hover');
              logError('Cell position not resolved from hover');
              hideControls();
              return;
            }
            activeCellPos = cellInsidePos;

            updateButtonPositions(tableRect);
            updateRowHandles(table, rowIndex);
            updateColHandles(tableRect, cellRect, colIndex);
            showControls();

            DEBUG.log(MODULE, 'Controls updated from hover', { rowIndex, colIndex, cellPos: activeCellPos });
          };

          // Context menu handlers
          const showContextMenu = (x: number, y: number, type: 'row' | 'column') => {
            cancelHideTimeout();
            const bh = t().blockHandles;
            const tc = t().tableControls;
            contextMenu.innerHTML = '';

            if (type === 'row') {
              contextMenu.appendChild(createBlockMenuItem({ label: tc.addRowBefore, action: 'addRowBefore', icon: icons.plus }));
              contextMenu.appendChild(createBlockMenuItem({ label: tc.addRowAfter, action: 'addRowAfter', icon: icons.plus }));
              contextMenu.appendChild(createBlockMenuItem({ label: bh.delete, action: 'deleteRow', icon: icons.trash }));
            } else {
              contextMenu.appendChild(createBlockMenuItem({ label: tc.addColumnBefore, action: 'addColBefore', icon: icons.plus }));
              contextMenu.appendChild(createBlockMenuItem({ label: tc.addColumnAfter, action: 'addColAfter', icon: icons.plus }));
              contextMenu.appendChild(createBlockMenuItem({ label: bh.delete, action: 'deleteCol', icon: icons.trash }));
            }
            contextMenu.appendChild(createBlockMenuSeparator());
            contextMenu.appendChild(createBlockMenuItem({ label: bh.plainText, action: 'plainTextTable', icon: icons.fileText }));

            // Position in viewport using CSS variables (CSP-safe)
            const menuWidth = 150;
            const menuHeight = 140;
            const menuX = Math.min(x, window.innerWidth - menuWidth - 10);
            const menuY = Math.min(y, window.innerHeight - menuHeight - 10);

            positionBlockMenu(contextMenu, {
              x: menuX,
              y: menuY,
              width: menuWidth,
              height: menuHeight,
            });
            contextMenu.classList.add('is-visible');
            const items = getBlockMenuItems(contextMenu);
            menuItemCount = items.length;
            menuSelectedIndex = menuItemCount > 0 ? 0 : -1;
            updateBlockMenuSelection(contextMenu, menuSelectedIndex);
            openMenu('tableContext');
            DEBUG.log(MODULE, 'Context menu shown', { x: menuX, y: menuY, type });
          };

          const hideContextMenu = () => {
            contextMenu.classList.remove('is-visible');
            menuSelectedIndex = -1;
            menuItemCount = 0;
            closeMenu('tableContext', { skipHide: true });
          };

          registerMenu('tableContext', hideContextMenu);

          const updateMenuSelection = () => {
            updateBlockMenuSelection(contextMenu, menuSelectedIndex);
          };

          const selectPrevMenuItem = () => {
            if (menuItemCount === 0) return;
            menuSelectedIndex = menuSelectedIndex <= 0 ? menuItemCount - 1 : menuSelectedIndex - 1;
            updateMenuSelection();
            DEBUG.log(MODULE, 'Table context menu selection prev', { index: menuSelectedIndex });
          };

          const selectNextMenuItem = () => {
            if (menuItemCount === 0) return;
            menuSelectedIndex = menuSelectedIndex >= menuItemCount - 1 ? 0 : menuSelectedIndex + 1;
            updateMenuSelection();
            DEBUG.log(MODULE, 'Table context menu selection next', { index: menuSelectedIndex });
          };

          const selectCurrentMenuItem = () => {
            if (menuSelectedIndex < 0) return;
            const items = getBlockMenuItems(contextMenu);
            const selectedItem = items[menuSelectedIndex] as HTMLElement | undefined;
            selectedItem?.click();
          };

          const handleMenuAction = (action: string) => {
            logInfo('Table context menu action', {
              action,
              hasActiveTable: Boolean(activeTable),
              activeRowIndex,
              activeColIndex,
              activeCellPos,
            });
            if (!activeTable) {
              DEBUG.error(MODULE, 'Table context action failed: active table missing', { action });
              logError('Table context action failed: active table missing', { action });
              hideContextMenu();
              return;
            }

            if (activeCellPos === null) {
              DEBUG.error(MODULE, 'Table context action failed: activeCellPos missing', { action });
              logError('Table context action failed: activeCellPos missing', { action });
              hideContextMenu();
              return;
            }

            if (!focusCellSelection(activeCellPos)) {
              DEBUG.error(MODULE, 'Table context action failed: selection focus failed', { action, activeCellPos });
              logError('Table context action failed: selection focus failed', { action, activeCellPos });
              hideContextMenu();
              return;
            }

            switch (action) {
              case 'addRowBefore':
                editor.chain().focus().addRowBefore().run();
                break;
              case 'addRowAfter':
                editor.chain().focus().addRowAfter().run();
                break;
              case 'deleteRow':
                editor.chain().focus().deleteRow().run();
                break;
              case 'addColBefore':
                editor.chain().focus().addColumnBefore().run();
                break;
              case 'addColAfter':
                editor.chain().focus().addColumnAfter().run();
                break;
              case 'deleteCol':
                editor.chain().focus().deleteColumn().run();
                break;
              case 'plainTextTable': {
                const table = findTable(view.state.doc.resolve(activeCellPos));
                if (!table) {
                  DEBUG.error(MODULE, 'Plain text edit failed: table resolve failed');
                  logError('Plain text edit failed: table resolve failed');
                  break;
                }
                const markdown = serializeMarkdown(editor, { type: 'doc', content: [table.node.toJSON()] }, {
                  blockType: 'table',
                });
                if (markdown === null) {
                  break;
                }
                const content = markdown.trimEnd();
                editor
                  .chain()
                  .focus()
                  .insertContentAt(
                    { from: table.pos, to: table.pos + table.node.nodeSize },
                    {
                      type: 'plainTextBlock',
                      content: content ? [{ type: 'text', text: content }] : [],
                    }
                  )
                  .setTextSelection(table.pos + 1)
                  .run();
                DEBUG.log(MODULE, 'Converted table to plain text', { pos: table.pos });
                break;
              }
            }

            hideContextMenu();
          };

          const resolveEdgeCellPos = (table: HTMLTableElement, edge: 'row' | 'col'): number | null => {
            const rows = Array.from(table.querySelectorAll('tr'));
            if (rows.length === 0) return null;

            if (edge === 'row') {
              const lastRow = rows[rows.length - 1];
              const cells = Array.from(lastRow.querySelectorAll('td, th'));
              const lastCell = cells[cells.length - 1] as HTMLElement | undefined;
              if (!lastCell) return null;
              return resolveCellInsidePosFromDom(lastCell);
            }

            const firstRow = rows[0];
            const firstRowCells = Array.from(firstRow.querySelectorAll('td, th'));
            const lastCell = firstRowCells[firstRowCells.length - 1] as HTMLElement | undefined;
            if (!lastCell) return null;
            return resolveCellInsidePosFromDom(lastCell);
          };

          const clampBoundary = (value: number, max: number): number => {
            if (value < 0) return 0;
            if (value > max) return max;
            return value;
          };

          const clampToRect = (value: number, min: number, max: number): number => {
            if (value < min) return min;
            if (value > max) return max;
            return value;
          };

          const updateDropIndicator = (axis: 'row' | 'col', boundary: number) => {
            if (!dragState) return;
            const isNoop = boundary === dragState.fromIndex || boundary === dragState.fromIndex + 1;
            if (isNoop) {
              rowDropIndicator.classList.remove('is-visible');
              colDropIndicator.classList.remove('is-visible');
              return;
            }
            const tableHost = view.nodeDOM(dragState.tablePos) as HTMLElement | null;
            const tableDom = resolveTableDom(tableHost);
            if (!tableDom) {
              DEBUG.error(MODULE, 'Drop indicator failed: table DOM missing');
              logError('Drop indicator failed: table DOM missing', { tablePos: dragState.tablePos });
              return;
            }

            const rect = tableDom.getBoundingClientRect();

            if (axis === 'row') {
              let y = rect.top;
              if (boundary <= 0) {
                y = rect.top;
              } else if (boundary >= dragState.map.height) {
                y = rect.bottom;
              } else {
                const cellPos = dragState.tableStart + dragState.map.positionAt(boundary, 0, dragState.tableNode);
                const cellDom = view.nodeDOM(cellPos) as HTMLElement | null;
                if (!cellDom) {
                  DEBUG.error(MODULE, 'Drop indicator failed: row cell DOM missing', { boundary });
                  logError('Drop indicator failed: row cell DOM missing', { boundary });
                  return;
                }
                y = cellDom.getBoundingClientRect().top;
              }

              rowDropIndicator.style.setProperty('--indicator-x', `${rect.left}px`);
              rowDropIndicator.style.setProperty('--indicator-y', `${y}px`);
              rowDropIndicator.style.setProperty('--indicator-width', `${rect.width}px`);
              rowDropIndicator.classList.add('is-visible');
              colDropIndicator.classList.remove('is-visible');
              return;
            }

            let x = rect.left;
            if (boundary <= 0) {
              x = rect.left;
            } else if (boundary >= dragState.map.width) {
              x = rect.right;
            } else {
              const cellPos = dragState.tableStart + dragState.map.positionAt(0, boundary, dragState.tableNode);
              const cellDom = view.nodeDOM(cellPos) as HTMLElement | null;
              if (!cellDom) {
                DEBUG.error(MODULE, 'Drop indicator failed: column cell DOM missing', { boundary });
                logError('Drop indicator failed: column cell DOM missing', { boundary });
                return;
              }
              x = cellDom.getBoundingClientRect().left;
            }

            colDropIndicator.style.setProperty('--indicator-x', `${x}px`);
            colDropIndicator.style.setProperty('--indicator-y', `${rect.top}px`);
            colDropIndicator.style.setProperty('--indicator-height', `${rect.height}px`);
            colDropIndicator.classList.add('is-visible');
            rowDropIndicator.classList.remove('is-visible');
          };

          const clearDragState = () => {
            if (dragState && activePointerId !== null) {
              try {
                dragState.handle.releasePointerCapture(activePointerId);
              } catch {
                // ignore
              }
            }
            dragState = null;
            activePointerId = null;
            pendingHandleAction = null;
            isDraggingRow = false;
            isDraggingCol = false;
            rowDropIndicator.classList.remove('is-visible');
            colDropIndicator.classList.remove('is-visible');
          };

          const startPointerDrag = (axis: 'row' | 'col', anchorCellPos: number, handle: HTMLElement, pointerId: number) => {
            const $cell = view.state.doc.resolve(anchorCellPos);
            const table = findTable($cell);
            if (!table) {
              DEBUG.error(MODULE, 'Table drag start failed: table not found');
              logError('Table drag start failed: table not found', { axis, anchorCellPos });
              return;
            }
            const tableHost = view.nodeDOM(table.pos) as HTMLElement | null;
            const tableDom = resolveTableDom(tableHost);
            if (!tableDom) {
              DEBUG.error(MODULE, 'Table drag start failed: table DOM missing');
              logError('Table drag start failed: table DOM missing', { axis, anchorCellPos, tablePos: table.pos });
              return;
            }

            const map = TableMap.get(table.node);
            const cellOffset = anchorCellPos - table.start;
            if (cellOffset < 0) {
              DEBUG.error(MODULE, 'Table drag start failed: invalid cell offset', { anchorCellPos, tableStart: table.start });
              logError('Table drag start failed: invalid cell offset', { axis, anchorCellPos, tableStart: table.start });
              return;
            }
            const rect = map.findCell(cellOffset);
            const fromIndex = axis === 'row' ? rect.top : rect.left;

            dragState = {
              axis,
              anchorCellPos,
              tablePos: table.pos,
              tableStart: table.start,
              tableNode: table.node,
              map,
              fromIndex,
              previewBoundary: fromIndex,
              handle,
              startedAt: Date.now(),
            };
            activePointerId = pointerId;
            handle.setPointerCapture(pointerId);

            activeTable = tableDom;
            activeCellPos = anchorCellPos;
            isDraggingRow = axis === 'row';
            isDraggingCol = axis === 'col';

            updateDropIndicator(axis, fromIndex);
            logInfo('Table drag started', { axis, fromIndex, anchorCellPos });
            DEBUG.log(MODULE, 'Table drag started', { axis, fromIndex });
          };

          const updatePointerDrag = (e: PointerEvent) => {
            if (!dragState || activePointerId !== e.pointerId) return;

            const tableHost = view.nodeDOM(dragState.tablePos) as HTMLElement | null;
            const tableDom = resolveTableDom(tableHost);
            if (!tableDom) {
              DEBUG.error(MODULE, 'Table drag update failed: table DOM missing');
              logError('Table drag update failed: table DOM missing', {
                axis: dragState.axis,
                tablePos: dragState.tablePos,
              });
              clearDragState();
              return;
            }
            const rect = tableDom.getBoundingClientRect();
            const safeX = clampToRect(e.clientX, rect.left + 1, rect.right - 1);
            const safeY = clampToRect(e.clientY, rect.top + 1, rect.bottom - 1);

            const coords = view.posAtCoords({ left: safeX, top: safeY });
            let boundary: number | null = null;

            if (coords) {
              const $pos = view.state.doc.resolve(coords.pos);
              const $cell = cellAround($pos);
              if ($cell) {
                const table = findTable($cell);
                if (table && table.pos === dragState.tablePos) {
                  const rect = dragState.map.findCell($cell.pos - table.start);
                  const cellStart = table.start + dragState.map.positionAt(rect.top, rect.left, table.node);
                  const cellDom = view.nodeDOM(cellStart) as HTMLElement | null;
                  if (!cellDom) {
                    DEBUG.error(MODULE, 'Table drag update failed: cell DOM missing');
                    logError('Table drag update failed: cell DOM missing', {
                      axis: dragState.axis,
                      row: rect.top,
                      col: rect.left,
                    });
                    clearDragState();
                    return;
                  }
                  const cellRect = cellDom.getBoundingClientRect();
                  if (dragState.axis === 'row') {
                    boundary = safeY < cellRect.top + cellRect.height / 2 ? rect.top : rect.bottom;
                  } else {
                    boundary = safeX < cellRect.left + cellRect.width / 2 ? rect.left : rect.right;
                  }
                }
              }
            }

            if (boundary === null) {
              if (dragState.axis === 'row') {
                if (e.clientY < rect.top) boundary = 0;
                else if (e.clientY > rect.bottom) boundary = dragState.map.height;
              } else {
                if (e.clientX < rect.left) boundary = 0;
                else if (e.clientX > rect.right) boundary = dragState.map.width;
              }
            }

            if (boundary === null) {
              return;
            }

            const max = dragState.axis === 'row' ? dragState.map.height : dragState.map.width;
            const nextBoundary = clampBoundary(boundary, max);

            if (nextBoundary !== dragState.previewBoundary) {
              dragState.previewBoundary = nextBoundary;
              updateDropIndicator(dragState.axis, nextBoundary);
              DEBUG.log(MODULE, 'Table drag preview', { axis: dragState.axis, boundary: nextBoundary });
            }
          };

          const finishPointerDrag = () => {
            if (!dragState) return;

            const { axis, anchorCellPos, fromIndex, previewBoundary, startedAt } = dragState;
            const max = axis === 'row' ? dragState.map.height : dragState.map.width;
            const boundary = previewBoundary === null ? fromIndex : clampBoundary(previewBoundary, max);
            const toIndex = boundary > fromIndex ? boundary - 1 : boundary;
            const durationMs = Date.now() - startedAt;

            if (toIndex === fromIndex) {
              logInfo('Table drag noop', { axis, fromIndex, toIndex, durationMs });
              DEBUG.log(MODULE, 'Table drag noop', { axis, fromIndex, toIndex });
              clearDragState();
              return;
            }

            if (!focusCellSelection(anchorCellPos + 1)) {
              logError('Table drag failed: cell selection focus failed', { axis, fromIndex, toIndex });
              clearDragState();
              return;
            }

            const command = axis === 'row'
              ? moveTableRow({ from: fromIndex, to: toIndex, pos: anchorCellPos })
              : moveTableColumn({ from: fromIndex, to: toIndex, pos: anchorCellPos });
            const moved = command(view.state, view.dispatch);
            if (!moved) {
              DEBUG.error(MODULE, 'Table move failed', { axis, fromIndex, toIndex });
              logError('Table drag failed', { axis, fromIndex, toIndex, durationMs });
            } else {
              DEBUG.log(MODULE, 'Table moved', { axis, fromIndex, toIndex });
              logSuccess('Table drag moved', { axis, fromIndex, toIndex, durationMs });
            }

            clearDragState();
          };

          // Event listeners
          const onRowBtnClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!activeTable) {
              logWarning('Row add button click ignored: no active table');
              return;
            }

            const edgePos = resolveEdgeCellPos(activeTable, 'row');
            if (edgePos === null) {
              logError('Row add button failed: edge cell missing');
              return;
            }

            DEBUG.log(MODULE, 'Row button clicked (append)', { pos: edgePos });
            if (!focusCellSelection(edgePos)) {
              logError('Row add button failed: selection focus failed', { pos: edgePos });
              return;
            }
            editor.chain().focus().addRowAfter().run();
          };

          const onColBtnClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!activeTable) {
              logWarning('Column add button click ignored: no active table');
              return;
            }

            const edgePos = resolveEdgeCellPos(activeTable, 'col');
            if (edgePos === null) {
              logError('Column add button failed: edge cell missing');
              return;
            }

            DEBUG.log(MODULE, 'Col button clicked (append)', { pos: edgePos });
            if (!focusCellSelection(edgePos)) {
              logError('Column add button failed: selection focus failed', { pos: edgePos });
              return;
            }
            editor.chain().focus().addColumnAfter().run();
          };

          const onMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.block-menu-item') as HTMLElement | null;
            const action = item?.dataset.action;
            if (action) {
              e.preventDefault();
              e.stopPropagation();
              handleMenuAction(action);
            }
          };

          const onDocumentClick = (e: MouseEvent) => {
            if (suppressNextDocumentClick) {
              suppressNextDocumentClick = false;
              return;
            }
            if (!contextMenu.contains(e.target as Node)) {
              hideContextMenu();
            }
          };

          const onMenuKeydown = (e: KeyboardEvent) => {
            if (!isMenuActive('tableContext')) {
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              hideContextMenu();
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              selectPrevMenuItem();
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              selectNextMenuItem();
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              selectCurrentMenuItem();
            }
          };

          // Scroll handler to update button positions
          const onScroll = () => {
            if (activeTable && activeCell) {
              const tableRect = activeTable.getBoundingClientRect();
              const cellRect = activeCell.getBoundingClientRect();
              updateButtonPositions(tableRect);
              updateRowHandles(activeTable, activeRowIndex);
              updateColHandles(tableRect, cellRect, activeColIndex);
            }
          };

          // Mousemove handler for hover-based detection
          const onMouseMove = (e: MouseEvent) => {
            if (isDraggingRow || isDraggingCol) return;
            if (isMenuActive('tableContext')) {
              cancelHideTimeout();
              return;
            }

            const target = e.target as HTMLElement;

            // Check if hovering over table controls (don't hide)
            if (target.closest('.table-add-btn') ||
                target.closest('.table-row-handles') ||
                target.closest('.table-col-handles') ||
                target.closest('.block-menu')) {
              cancelHideTimeout();
              return;
            }

            // Check if hovering over a table cell
            const cell = target.closest('td, th') as HTMLElement | null;
            const table = target.closest('table') as HTMLTableElement | null;

            if (cell && table) {
              cancelHideTimeout();
              updateControlsFromHover(cell, table);
            } else {
              // Not over a table, schedule hide
              scheduleHide();
            }
          };

          // Handle mouse enter on controls to prevent hide
          const onControlsMouseEnter = () => {
            cancelHideTimeout();
          };

          // Handle mouse leave on controls
          const onControlsMouseLeave = () => {
            if (!isDraggingRow && !isDraggingCol) {
              scheduleHide();
            }
          };

          const onHandlePointerDown = (e: PointerEvent) => {
            if (!e.isPrimary) return;
            if (typeof e.button === 'number' && e.button !== 0) return;
            const target = e.target as HTMLElement;
            const rowHandle = target.closest('.table-row-handle') as HTMLElement | null;
            const colHandle = target.closest('.table-col-handle') as HTMLElement | null;
            const handle = rowHandle || colHandle;
            if (!handle) return;

            const cellPosRaw = handle.dataset.cellPos;
            if (!cellPosRaw) {
              DEBUG.error(MODULE, 'Pointer drag start failed: cellPos missing on handle');
              logError('Pointer drag start failed: cellPos missing on handle');
              return;
            }

            const cellPos = Number(cellPosRaw);
            if (!Number.isFinite(cellPos)) {
              DEBUG.error(MODULE, 'Pointer drag start failed: invalid cellPos', { cellPosRaw });
              logError('Pointer drag start failed: invalid cellPos', { cellPosRaw });
              return;
            }

            e.preventDefault();
            e.stopPropagation();

            const axis: 'row' | 'col' = rowHandle ? 'row' : 'col';
            const rowIndex = rowHandle ? Number(rowHandle.dataset.rowIndex ?? 'NaN') : null;
            const colIndex = colHandle ? Number(colHandle.dataset.colIndex ?? 'NaN') : null;
            pendingHandleAction = {
              axis,
              cellPos,
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              handle,
              rowIndex: Number.isFinite(rowIndex ?? NaN) ? (rowIndex as number) : null,
              colIndex: Number.isFinite(colIndex ?? NaN) ? (colIndex as number) : null,
            };
            logInfo('Table handle pointerdown (pending)', { axis, cellPos });
          };

          const onHandlePointerMove = (e: PointerEvent) => {
            if (dragState && activePointerId === e.pointerId) {
              e.preventDefault();
              updatePointerDrag(e);
              return;
            }

            if (!pendingHandleAction || pendingHandleAction.pointerId !== e.pointerId) {
              return;
            }

            const dx = e.clientX - pendingHandleAction.startX;
            const dy = e.clientY - pendingHandleAction.startY;
            const distance = Math.hypot(dx, dy);
            if (distance < HANDLE_DRAG_THRESHOLD_PX) {
              return;
            }

            const { axis, cellPos, handle } = pendingHandleAction;
            pendingHandleAction = null;
            logInfo('Table handle drag threshold reached', { axis, cellPos, distance });
            startPointerDrag(axis, cellPos, handle, e.pointerId);
            if (dragState && activePointerId === e.pointerId) {
              e.preventDefault();
              updatePointerDrag(e);
            }
          };

          const onHandlePointerUp = (e: PointerEvent) => {
            if (dragState && activePointerId === e.pointerId) {
              e.preventDefault();
              finishPointerDrag();
              return;
            }

            if (!pendingHandleAction || pendingHandleAction.pointerId !== e.pointerId) {
              return;
            }

            e.preventDefault();
            e.stopPropagation();

            const { axis, cellPos, rowIndex, colIndex } = pendingHandleAction;
            pendingHandleAction = null;

            if (!activeTable) {
              DEBUG.error(MODULE, 'Table handle click ignored: active table missing');
              logError('Table handle click ignored: active table missing', { axis });
              return;
            }

            activeCellPos = cellPos;
            if (axis === 'row') {
              activeRowIndex = rowIndex;
            } else {
              activeColIndex = colIndex;
            }

            suppressNextDocumentClick = true;
            setTimeout(() => {
              suppressNextDocumentClick = false;
            }, 0);
            showContextMenu(e.clientX, e.clientY, axis);
          };

          const onHandlePointerCancel = (e: PointerEvent) => {
            if (dragState && activePointerId === e.pointerId) {
              e.preventDefault();
              DEBUG.warn(MODULE, 'Pointer drag cancelled');
              logWarning('Table drag cancelled', { axis: dragState.axis });
              clearDragState();
              return;
            }
            if (pendingHandleAction && pendingHandleAction.pointerId === e.pointerId) {
              e.preventDefault();
              pendingHandleAction = null;
            }
          };

          // Get scroll container
          const editorContainer = view.dom.closest('.editor-container') as HTMLElement;

          // Attach event listeners
          view.dom.addEventListener('mousemove', onMouseMove);
          addRowBtn.addEventListener('click', onRowBtnClick);
          addColBtn.addEventListener('click', onColBtnClick);
          contextMenu.addEventListener('click', onMenuClick);
          document.addEventListener('click', onDocumentClick);
          document.addEventListener('keydown', onMenuKeydown);
          editorContainer?.addEventListener('scroll', onScroll);

          // Row/column handle event listeners
          document.addEventListener('pointerdown', onHandlePointerDown, true);
          document.addEventListener('pointermove', onHandlePointerMove);
          document.addEventListener('pointerup', onHandlePointerUp);
          document.addEventListener('pointercancel', onHandlePointerCancel);
          document.addEventListener('lostpointercapture', onHandlePointerCancel);

          // Add button hover handlers
          addRowBtn.addEventListener('mouseenter', onControlsMouseEnter);
          addRowBtn.addEventListener('mouseleave', onControlsMouseLeave);
          addColBtn.addEventListener('mouseenter', onControlsMouseEnter);
          addColBtn.addEventListener('mouseleave', onControlsMouseLeave);

          DEBUG.log(MODULE, 'Event listeners attached (hover-based)');
          // Initial check (wait for hover)

          return {
            update() {
              // Update controls if we have an active table (from hover or selection)
              // This handles position updates when document changes
              if (activeTable && activeCell) {
                const tableRect = activeTable.getBoundingClientRect();
                const cellRect = activeCell.getBoundingClientRect();
                updateButtonPositions(tableRect);
                updateRowHandles(activeTable, activeRowIndex);
                updateColHandles(tableRect, cellRect, activeColIndex);
              }
            },
            destroy() {
              DEBUG.log(MODULE, 'Plugin destroyed');
              cancelHideTimeout();
              clearDragState();
              view.dom.removeEventListener('mousemove', onMouseMove);
              addRowBtn.removeEventListener('click', onRowBtnClick);
              addRowBtn.removeEventListener('mouseenter', onControlsMouseEnter);
              addRowBtn.removeEventListener('mouseleave', onControlsMouseLeave);
              addColBtn.removeEventListener('click', onColBtnClick);
              addColBtn.removeEventListener('mouseenter', onControlsMouseEnter);
              addColBtn.removeEventListener('mouseleave', onControlsMouseLeave);
              contextMenu.removeEventListener('click', onMenuClick);
              document.removeEventListener('click', onDocumentClick);
              document.removeEventListener('keydown', onMenuKeydown);
              editorContainer?.removeEventListener('scroll', onScroll);

              document.removeEventListener('pointerdown', onHandlePointerDown, true);
              document.removeEventListener('pointermove', onHandlePointerMove);
              document.removeEventListener('pointerup', onHandlePointerUp);
              document.removeEventListener('pointercancel', onHandlePointerCancel);
              document.removeEventListener('lostpointercapture', onHandlePointerCancel);

              contextMenu.remove();
              addRowBtn.remove();
              addColBtn.remove();
              rowHandlesContainer.remove();
              colHandlesContainer.remove();
              rowDropIndicator.remove();
              colDropIndicator.remove();
            },
          };
        },
      }),
    ];
  },
});

function createAddButton(type: 'row' | 'col'): HTMLElement {
  const btn = document.createElement('button');
  btn.className = `table-add-btn table-add-btn-${type}`;
  const tc = t().tableControls;
  const label = type === 'row' ? tc.addRow : tc.addColumn;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.dataset.axis = type;
  btn.innerHTML = icons.plus;
  return btn;
}

/**
 * Create row handles container (holds all row handles)
 */
function createRowHandlesContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'table-row-handles';
  return container;
}

/**
 * Create a single row handle
 */
function createRowHandle(rowIndex: number, cellPos: number): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'table-row-handle';
  handle.dataset.rowIndex = String(rowIndex);
  handle.dataset.cellPos = String(cellPos);
  handle.innerHTML = icons.gripVertical;
  handle.draggable = false;
  handle.contentEditable = 'false';
  handle.title = t().tableControls.dragRow;
  return handle;
}

/**
 * Create column handles container
 */
function createColHandlesContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'table-col-handles';
  return container;
}

/**
 * Create a single column handle
 */
function createColHandle(colIndex: number, cellPos: number): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'table-col-handle';
  handle.dataset.colIndex = String(colIndex);
  handle.dataset.cellPos = String(cellPos);
  handle.innerHTML = icons.gripHorizontal;
  handle.draggable = false;
  handle.contentEditable = 'false';
  handle.title = t().tableControls.dragColumn;
  return handle;
}

/**
 * Create drop indicator for row/column reordering
 */
function createTableDropIndicator(type: 'row' | 'col'): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = `table-drop-indicator table-drop-indicator-${type}`;
  return indicator;
}
