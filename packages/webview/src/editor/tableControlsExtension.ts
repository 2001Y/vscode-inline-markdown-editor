/**
 * Table Controls Extension for Tiptap
 * Provides Notion-like UI for table manipulation:
 * - + buttons at row/column edges for adding rows/columns
 * - 6-dot drag handles with context menu for row/column operations
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { DEBUG } from './debug.js';

const MODULE = 'TableControls';

// Layout constants
const HANDLE_OFFSET = 24; // Space for row/column handles
const HANDLE_SIZE = 20;
const BUTTON_SIZE = 16;
const HIDE_DELAY_MS = 150; // Delay before hiding overlay

export const TableControlsPluginKey = new PluginKey('tableControls');

/**
 * Create the controls overlay element
 */
function createControlsOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'table-controls-overlay';
  overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    z-index: 50;
    display: none;
  `;
  return overlay;
}

/**
 * Create add row button
 */
function createAddRowButton(position: 'after'): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'table-add-row-btn';
  btn.dataset.position = position;
  btn.innerHTML = '+';
  btn.title = '下に行を追加';
  btn.style.cssText = `
    position: absolute;
    pointer-events: auto;
    width: ${BUTTON_SIZE}px;
    height: ${BUTTON_SIZE}px;
    border: none;
    border-radius: 50%;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity 0.15s ease, transform 0.1s ease;
  `;
  return btn;
}

/**
 * Create add column button
 */
function createAddColumnButton(position: 'after'): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'table-add-col-btn';
  btn.dataset.position = position;
  btn.innerHTML = '+';
  btn.title = '右に列を追加';
  btn.style.cssText = `
    position: absolute;
    pointer-events: auto;
    width: ${BUTTON_SIZE}px;
    height: ${BUTTON_SIZE}px;
    border: none;
    border-radius: 50%;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity 0.15s ease, transform 0.1s ease;
  `;
  return btn;
}

/**
 * Create drag handle for row
 */
function createRowHandle(rowIndex: number): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'table-row-handle';
  handle.dataset.row = String(rowIndex);
  handle.innerHTML = '⋮⋮';
  handle.title = '行を操作（右クリックでメニュー）';
  handle.style.cssText = `
    position: absolute;
    pointer-events: auto;
    width: ${HANDLE_SIZE}px;
    height: ${HANDLE_SIZE}px;
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
  `;
  return handle;
}

/**
 * Create drag handle for column
 */
function createColumnHandle(colIndex: number): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'table-col-handle';
  handle.dataset.col = String(colIndex);
  handle.innerHTML = '⋮⋮';
  handle.title = '列を操作（右クリックでメニュー）';
  handle.style.cssText = `
    position: absolute;
    pointer-events: auto;
    width: ${HANDLE_SIZE}px;
    height: ${HANDLE_SIZE}px;
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
    transform: rotate(90deg);
  `;
  return handle;
}

/**
 * Create context menu for row/column operations
 */
function createContextMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'table-context-menu';
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
function createMenuItem(label: string, action: string): HTMLElement {
  const item = document.createElement('button');
  item.className = 'table-context-menu-item';
  item.dataset.action = action;
  item.textContent = label;
  item.style.cssText = `
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--vscode-editor-foreground);
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  `;
  return item;
}

export interface TableControlsOptions {
  // Future options can be added here
}

export const TableControls = Extension.create<TableControlsOptions>({
  name: 'tableControls',

  addProseMirrorPlugins() {
    const editor = this.editor;
    let overlay: HTMLElement | null = null;
    let contextMenu: HTMLElement | null = null;
    let currentTable: HTMLElement | null = null;
    let hoveredRow: number | null = null;
    let hoveredCol: number | null = null;
    let hideTimeoutId: number | null = null;
    let scrollContainer: HTMLElement | null = null;

    const cancelHideTimeout = () => {
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
      }
    };

    const scheduleHide = () => {
      cancelHideTimeout();
      hideTimeoutId = window.setTimeout(() => {
        if (overlay) {
          DEBUG.log(MODULE, 'Hiding overlay (timeout)');
          overlay.style.display = 'none';
        }
        currentTable = null;
        hoveredRow = null;
        hoveredCol = null;
        hideTimeoutId = null;
      }, HIDE_DELAY_MS);
    };

    const showOverlay = () => {
      cancelHideTimeout();
      if (overlay) {
        overlay.style.display = 'block';
      }
    };

    const hideContextMenu = () => {
      if (contextMenu) {
        contextMenu.style.display = 'none';
        DEBUG.log(MODULE, 'Context menu hidden');
      }
    };

    const showContextMenu = (x: number, y: number, type: 'row' | 'column', index: number) => {
      if (!contextMenu) return;

      DEBUG.log(MODULE, 'Showing context menu', { type, index, x, y });
      contextMenu.innerHTML = '';

      if (type === 'row') {
        contextMenu.appendChild(createMenuItem('上に行を追加', `addRowBefore:${index}`));
        contextMenu.appendChild(createMenuItem('下に行を追加', `addRowAfter:${index}`));
        const separator = document.createElement('div');
        separator.style.cssText = 'height: 1px; background: var(--vscode-editorWidget-border); margin: 4px 0;';
        contextMenu.appendChild(separator);
        contextMenu.appendChild(createMenuItem('行を削除', `deleteRow:${index}`));
      } else {
        contextMenu.appendChild(createMenuItem('左に列を追加', `addColBefore:${index}`));
        contextMenu.appendChild(createMenuItem('右に列を追加', `addColAfter:${index}`));
        const separator = document.createElement('div');
        separator.style.cssText = 'height: 1px; background: var(--vscode-editorWidget-border); margin: 4px 0;';
        contextMenu.appendChild(separator);
        contextMenu.appendChild(createMenuItem('列を削除', `deleteCol:${index}`));
      }

      // Position menu ensuring it stays in viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 150;
      const menuHeight = 120;

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

    const handleContextMenuAction = (action: string) => {
      const [command, indexStr] = action.split(':');
      const index = parseInt(indexStr, 10);
      DEBUG.log(MODULE, 'Context menu action', { command, index });

      // First, select the appropriate cell in the target row/column
      if (currentTable) {
        const rows = currentTable.querySelectorAll('tr');
        if (command.includes('Row') && rows[index]) {
          const firstCell = rows[index].querySelector('td, th');
          if (firstCell) {
            // Click to focus the cell
            (firstCell as HTMLElement).click();
          }
        } else if (command.includes('Col')) {
          const firstRow = rows[0];
          if (firstRow) {
            const cells = firstRow.querySelectorAll('td, th');
            if (cells[index]) {
              (cells[index] as HTMLElement).click();
            }
          }
        }
      }

      // Execute the command
      setTimeout(() => {
        switch (command) {
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
        }
      }, 10);

      hideContextMenu();
    };

    const updateControls = (view: EditorView) => {
      if (!overlay || !currentTable) return;

      const overlayEl = overlay;
      const tableElement = currentTable;
      const tableRect = tableElement.getBoundingClientRect();

      // Get the editor container (which is the scroll container)
      const editorContainer = view.dom.closest('.editor-container') as HTMLElement;
      if (!editorContainer) {
        DEBUG.warn(MODULE, 'Editor container not found');
        return;
      }
      const containerRect = editorContainer.getBoundingClientRect();

      // Calculate position relative to the editor container
      const left = tableRect.left - containerRect.left + editorContainer.scrollLeft - HANDLE_OFFSET;
      const top = tableRect.top - containerRect.top + editorContainer.scrollTop - HANDLE_OFFSET;

      overlayEl.style.left = `${left}px`;
      overlayEl.style.top = `${top}px`;
      overlayEl.style.width = `${tableRect.width + HANDLE_OFFSET * 2}px`;
      overlayEl.style.height = `${tableRect.height + HANDLE_OFFSET * 2}px`;

      DEBUG.log(MODULE, 'Updated overlay position', {
        left, top, width: tableRect.width, height: tableRect.height
      });

      // Clear existing controls
      overlayEl.innerHTML = '';

      const rows = tableElement.querySelectorAll('tr');
      const firstRow = rows[0];
      const cells = firstRow ? firstRow.querySelectorAll('th, td') : [];

      // Add row controls (left side)
      rows.forEach((row, rowIndex) => {
        const rowRect = row.getBoundingClientRect();
        const y = rowRect.top - tableRect.top + rowRect.height / 2 - HANDLE_SIZE / 2 + HANDLE_OFFSET;

        // Row handle (6-dot)
        const handle = createRowHandle(rowIndex);
        handle.style.left = `${(HANDLE_OFFSET - HANDLE_SIZE) / 2}px`;
        handle.style.top = `${y}px`;
        if (hoveredRow === rowIndex) {
          handle.style.opacity = '1';
        }
        overlayEl.appendChild(handle);
      });

      // Add row button (bottom center)
      if (rows.length > 0) {
        const addRowBtn = createAddRowButton('after');
        addRowBtn.style.left = `${tableRect.width / 2 + HANDLE_OFFSET - BUTTON_SIZE / 2}px`;
        addRowBtn.style.top = `${tableRect.height + HANDLE_OFFSET + 2}px`;
        overlayEl.appendChild(addRowBtn);
      }

      // Add column controls (top side)
      cells.forEach((cell, colIndex) => {
        const cellRect = cell.getBoundingClientRect();
        const x = cellRect.left - tableRect.left + cellRect.width / 2 - HANDLE_SIZE / 2 + HANDLE_OFFSET;

        // Column handle (6-dot)
        const handle = createColumnHandle(colIndex);
        handle.style.left = `${x}px`;
        handle.style.top = `${(HANDLE_OFFSET - HANDLE_SIZE) / 2}px`;
        if (hoveredCol === colIndex) {
          handle.style.opacity = '1';
        }
        overlayEl.appendChild(handle);
      });

      // Add column button (right center)
      if (cells.length > 0) {
        const addColBtn = createAddColumnButton('after');
        addColBtn.style.left = `${tableRect.width + HANDLE_OFFSET + 2}px`;
        addColBtn.style.top = `${tableRect.height / 2 + HANDLE_OFFSET - BUTTON_SIZE / 2}px`;
        overlayEl.appendChild(addColBtn);
      }
    };

    return [
      new Plugin({
        key: TableControlsPluginKey,
        view(view) {
          DEBUG.log(MODULE, 'Plugin initialized');

          // Find scroll container
          scrollContainer = view.dom.closest('.editor-container') as HTMLElement;
          if (!scrollContainer) {
            DEBUG.warn(MODULE, 'Scroll container not found');
          }

          // Create overlay
          overlay = createControlsOverlay();
          // Append to editor container (not view.dom.parentElement) for proper positioning
          if (scrollContainer) {
            scrollContainer.style.position = 'relative'; // Ensure positioning context
            scrollContainer.appendChild(overlay);
          } else {
            view.dom.parentElement?.appendChild(overlay);
          }

          // Create context menu
          contextMenu = createContextMenu();
          document.body.appendChild(contextMenu);

          // Event handlers
          const onMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const table = target.closest('table');

            if (table) {
              if (currentTable !== table) {
                DEBUG.log(MODULE, 'Mouse entered table');
              }
              currentTable = table;
              showOverlay();

              // Detect hovered row/col
              const cell = target.closest('td, th');
              if (cell) {
                const row = cell.closest('tr');
                if (row) {
                  const tbody = row.parentElement;
                  if (tbody) {
                    const allRows = Array.from(tbody.querySelectorAll('tr'));
                    hoveredRow = allRows.indexOf(row);
                    const rowCells = Array.from(row.querySelectorAll('td, th'));
                    hoveredCol = rowCells.indexOf(cell);
                  }
                }
              }

              updateControls(view);
            } else if (target.closest('.table-controls-overlay')) {
              // Mouse is on overlay - keep showing
              showOverlay();
            } else if (!target.closest('.table-context-menu')) {
              // Mouse left table and overlay - schedule hide
              scheduleHide();
            }
          };

          const onOverlayMouseEnter = () => {
            cancelHideTimeout();
          };

          const onOverlayMouseLeave = () => {
            scheduleHide();
          };

          const onOverlayMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('table-row-handle') ||
                target.classList.contains('table-col-handle') ||
                target.classList.contains('table-add-row-btn') ||
                target.classList.contains('table-add-col-btn')) {
              target.style.opacity = '1';
            }
          };

          const onOverlayMouseOut = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('table-row-handle') ||
                target.classList.contains('table-col-handle')) {
              target.style.opacity = '0';
            }
          };

          const onOverlayClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            if (target.classList.contains('table-add-row-btn')) {
              e.preventDefault();
              e.stopPropagation();
              DEBUG.log(MODULE, 'Add row button clicked');

              // Click into the last cell to ensure we're in the table
              if (currentTable) {
                const lastRow = currentTable.querySelector('tr:last-child');
                const lastCell = lastRow?.querySelector('td, th');
                if (lastCell) {
                  (lastCell as HTMLElement).click();
                  setTimeout(() => {
                    editor.chain().focus().addRowAfter().run();
                  }, 10);
                }
              }
            } else if (target.classList.contains('table-add-col-btn')) {
              e.preventDefault();
              e.stopPropagation();
              DEBUG.log(MODULE, 'Add column button clicked');

              // Click into the last column to ensure we're in the table
              if (currentTable) {
                const firstRow = currentTable.querySelector('tr');
                const lastCell = firstRow?.querySelector('td:last-child, th:last-child');
                if (lastCell) {
                  (lastCell as HTMLElement).click();
                  setTimeout(() => {
                    editor.chain().focus().addColumnAfter().run();
                  }, 10);
                }
              }
            }
          };

          const onOverlayContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            if (target.classList.contains('table-row-handle')) {
              e.preventDefault();
              const rowIndex = parseInt(target.dataset.row || '0', 10);
              showContextMenu(e.clientX, e.clientY, 'row', rowIndex);
            } else if (target.classList.contains('table-col-handle')) {
              e.preventDefault();
              const colIndex = parseInt(target.dataset.col || '0', 10);
              showContextMenu(e.clientX, e.clientY, 'column', colIndex);
            }
          };

          const onContextMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('table-context-menu-item')) {
              e.preventDefault();
              e.stopPropagation();
              const action = target.dataset.action;
              if (action) {
                handleContextMenuAction(action);
              }
            }
          };

          const onDocumentClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.table-context-menu')) {
              hideContextMenu();
            }
          };

          const onScroll = () => {
            if (currentTable && overlay?.style.display !== 'none') {
              DEBUG.log(MODULE, 'Scroll event - updating controls');
              updateControls(view);
            }
          };

          // Add event listeners
          view.dom.addEventListener('mousemove', onMouseMove);
          overlay?.addEventListener('mouseenter', onOverlayMouseEnter);
          overlay?.addEventListener('mouseleave', onOverlayMouseLeave);
          overlay?.addEventListener('mouseover', onOverlayMouseOver);
          overlay?.addEventListener('mouseout', onOverlayMouseOut);
          overlay?.addEventListener('click', onOverlayClick);
          overlay?.addEventListener('contextmenu', onOverlayContextMenu);
          contextMenu?.addEventListener('click', onContextMenuClick);
          document.addEventListener('click', onDocumentClick);
          scrollContainer?.addEventListener('scroll', onScroll);

          return {
            update(view) {
              if (currentTable && overlay?.style.display !== 'none') {
                updateControls(view);
              }
            },
            destroy() {
              DEBUG.log(MODULE, 'Plugin destroyed');
              cancelHideTimeout();
              view.dom.removeEventListener('mousemove', onMouseMove);
              overlay?.removeEventListener('mouseenter', onOverlayMouseEnter);
              overlay?.removeEventListener('mouseleave', onOverlayMouseLeave);
              overlay?.removeEventListener('mouseover', onOverlayMouseOver);
              overlay?.removeEventListener('mouseout', onOverlayMouseOut);
              overlay?.removeEventListener('click', onOverlayClick);
              overlay?.removeEventListener('contextmenu', onOverlayContextMenu);
              contextMenu?.removeEventListener('click', onContextMenuClick);
              document.removeEventListener('click', onDocumentClick);
              scrollContainer?.removeEventListener('scroll', onScroll);
              overlay?.remove();
              contextMenu?.remove();
            },
          };
        },
      }),
    ];
  },
});
