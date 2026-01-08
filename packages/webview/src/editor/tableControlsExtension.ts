/**
 * Table Controls Extension for Tiptap
 * Provides Notion-like UI for table manipulation:
 * - + buttons at row/column edges for adding rows/columns
 * - 6-dot drag handles with context menu for row/column operations
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

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
  `;
  return overlay;
}

/**
 * Create add row button
 */
function createAddRowButton(rowIndex: number, position: 'before' | 'after'): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'table-add-row-btn';
  btn.dataset.row = String(rowIndex);
  btn.dataset.position = position;
  btn.innerHTML = '+';
  btn.title = position === 'before' ? '上に行を追加' : '下に行を追加';
  btn.style.cssText = `
    position: absolute;
    pointer-events: auto;
    width: 16px;
    height: 16px;
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
    opacity: 0;
    transition: opacity 0.15s ease;
  `;
  return btn;
}

/**
 * Create add column button
 */
function createAddColumnButton(colIndex: number, position: 'before' | 'after'): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'table-add-col-btn';
  btn.dataset.col = String(colIndex);
  btn.dataset.position = position;
  btn.innerHTML = '+';
  btn.title = position === 'before' ? '左に列を追加' : '右に列を追加';
  btn.style.cssText = `
    position: absolute;
    pointer-events: auto;
    width: 16px;
    height: 16px;
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
    opacity: 0;
    transition: opacity 0.15s ease;
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
    width: 16px;
    height: 20px;
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
    width: 20px;
    height: 16px;
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

    const hideContextMenu = () => {
      if (contextMenu) {
        contextMenu.style.display = 'none';
      }
    };

    const showContextMenu = (x: number, y: number, type: 'row' | 'column', index: number) => {
      if (!contextMenu) return;

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

      contextMenu.style.left = `${x}px`;
      contextMenu.style.top = `${y}px`;
      contextMenu.style.display = 'block';
    };

    const handleContextMenuAction = (action: string) => {
      const [command] = action.split(':');

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

      hideContextMenu();
    };

    const updateControls = (view: EditorView) => {
      if (!overlay || !currentTable) return;

      // Store in local const for TypeScript narrowing
      const overlayEl = overlay;
      const tableElement = currentTable;
      const tableRect = tableElement.getBoundingClientRect();
      const editorRect = view.dom.getBoundingClientRect();

      // Position overlay relative to the table
      overlayEl.style.left = `${tableRect.left - editorRect.left - 24}px`;
      overlayEl.style.top = `${tableRect.top - editorRect.top - 20}px`;
      overlayEl.style.width = `${tableRect.width + 48}px`;
      overlayEl.style.height = `${tableRect.height + 40}px`;

      // Clear existing controls
      overlayEl.innerHTML = '';

      const rows = tableElement.querySelectorAll('tr');
      const firstRow = rows[0];
      const cells = firstRow ? firstRow.querySelectorAll('th, td') : [];

      // Add row controls (left side)
      rows.forEach((row, rowIndex) => {
        const rowRect = row.getBoundingClientRect();
        const y = rowRect.top - tableRect.top + rowRect.height / 2;

        // Row handle (6-dot)
        const handle = createRowHandle(rowIndex);
        handle.style.left = '0px';
        handle.style.top = `${y + 20 - 10}px`;
        if (hoveredRow === rowIndex) {
          handle.style.opacity = '1';
        }
        overlayEl.appendChild(handle);

        // Add row button (bottom edge)
        if (rowIndex === rows.length - 1) {
          const addBtn = createAddRowButton(rowIndex, 'after');
          addBtn.style.left = `${tableRect.width / 2 + 24 - 8}px`;
          addBtn.style.top = `${y + rowRect.height / 2 + 20 + 2}px`;
          addBtn.style.opacity = '0.7';
          overlayEl.appendChild(addBtn);
        }
      });

      // Add column controls (top side)
      cells.forEach((cell, colIndex) => {
        const cellRect = cell.getBoundingClientRect();
        const x = cellRect.left - tableRect.left + cellRect.width / 2;

        // Column handle (6-dot)
        const handle = createColumnHandle(colIndex);
        handle.style.left = `${x + 24 - 10}px`;
        handle.style.top = '0px';
        if (hoveredCol === colIndex) {
          handle.style.opacity = '1';
        }
        overlayEl.appendChild(handle);

        // Add column button (right edge)
        if (colIndex === cells.length - 1) {
          const addBtn = createAddColumnButton(colIndex, 'after');
          addBtn.style.left = `${cellRect.right - tableRect.left + 24 + 2}px`;
          addBtn.style.top = `${tableRect.height / 2 + 20 - 8}px`;
          addBtn.style.opacity = '0.7';
          overlayEl.appendChild(addBtn);
        }
      });
    };

    return [
      new Plugin({
        key: TableControlsPluginKey,
        view(view) {
          // Create overlay
          overlay = createControlsOverlay();
          overlay.style.display = 'none';
          view.dom.parentElement?.appendChild(overlay);

          // Create context menu
          contextMenu = createContextMenu();
          document.body.appendChild(contextMenu);

          // Event handlers
          const onMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const table = target.closest('table');

            if (table && overlay) {
              currentTable = table;
              overlay.style.display = 'block';

              // Detect hovered row/col
              const cell = target.closest('td, th');
              if (cell) {
                const row = cell.closest('tr');
                if (row && row.parentElement) {
                  const rows = Array.from(row.parentElement.querySelectorAll('tr'));
                  hoveredRow = rows.indexOf(row);

                  const cells = Array.from(row.querySelectorAll('td, th'));
                  hoveredCol = cells.indexOf(cell);
                }
              }

              updateControls(view);
            } else if (!target.closest('.table-controls-overlay') && !target.closest('.table-context-menu')) {
              if (overlay) {
                overlay.style.display = 'none';
              }
              currentTable = null;
              hoveredRow = null;
              hoveredCol = null;
            }
          };

          const onOverlayMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Show handles/buttons on hover
            if (target.classList.contains('table-row-handle') ||
                target.classList.contains('table-col-handle') ||
                target.classList.contains('table-add-row-btn') ||
                target.classList.contains('table-add-col-btn')) {
              target.style.opacity = '1';
            }
          };

          const onOverlayMouseOut = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Hide handles/buttons unless hovered
            if (target.classList.contains('table-row-handle') ||
                target.classList.contains('table-col-handle')) {
              const row = target.dataset.row;
              const col = target.dataset.col;
              if ((row !== undefined && parseInt(row, 10) !== hoveredRow) ||
                  (col !== undefined && parseInt(col, 10) !== hoveredCol)) {
                target.style.opacity = '0';
              }
            }
          };

          const onOverlayClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Handle add row/column buttons
            if (target.classList.contains('table-add-row-btn')) {
              e.preventDefault();
              e.stopPropagation();
              const position = target.dataset.position;
              if (position === 'before') {
                editor.chain().focus().addRowBefore().run();
              } else {
                editor.chain().focus().addRowAfter().run();
              }
            } else if (target.classList.contains('table-add-col-btn')) {
              e.preventDefault();
              e.stopPropagation();
              const position = target.dataset.position;
              if (position === 'before') {
                editor.chain().focus().addColumnBefore().run();
              } else {
                editor.chain().focus().addColumnAfter().run();
              }
            }
          };

          const onOverlayContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Handle right-click on handles
            if (target.classList.contains('table-row-handle')) {
              e.preventDefault();
              const rowIndex = parseInt(target.dataset.row || '0', 10);
              // Select the row first
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

          // Add event listeners
          view.dom.addEventListener('mousemove', onMouseMove);
          overlay?.addEventListener('mouseover', onOverlayMouseOver);
          overlay?.addEventListener('mouseout', onOverlayMouseOut);
          overlay?.addEventListener('click', onOverlayClick);
          overlay?.addEventListener('contextmenu', onOverlayContextMenu);
          contextMenu?.addEventListener('click', onContextMenuClick);
          document.addEventListener('click', onDocumentClick);

          return {
            update(view) {
              if (currentTable && overlay?.style.display !== 'none') {
                updateControls(view);
              }
            },
            destroy() {
              view.dom.removeEventListener('mousemove', onMouseMove);
              overlay?.removeEventListener('mouseover', onOverlayMouseOver);
              overlay?.removeEventListener('mouseout', onOverlayMouseOut);
              overlay?.removeEventListener('click', onOverlayClick);
              overlay?.removeEventListener('contextmenu', onOverlayContextMenu);
              contextMenu?.removeEventListener('click', onContextMenuClick);
              document.removeEventListener('click', onDocumentClick);
              overlay?.remove();
              contextMenu?.remove();
            },
          };
        },
      }),
    ];
  },
});
