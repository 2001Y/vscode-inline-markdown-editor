/**
 * Block Handles Extension for Tiptap
 * Provides Notion-like block manipulation UI:
 * - 6-dot drag handles on the left of each block (including list items)
 * - Right-click context menu for block operations
 * - Drag and drop for block reordering
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { DEBUG } from './debug.js';
import { t } from './i18n.js';
import { icons } from './icons.js';

const MODULE = 'BlockHandles';

// Layout constants
const HANDLE_WIDTH = 24;
const HANDLE_HEIGHT = 28;
const HANDLE_OFFSET = 4;
const HIDE_DELAY_MS = 150;

export const BlockHandlesPluginKey = new PluginKey('blockHandles');

// Block types that should have handles (including nested items)
const HANDLE_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',      // Individual list items get handles
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'rawBlock',
  'htmlBlock',
  // Note: 'table' is handled by TableControls
  // Note: 'bulletList' and 'orderedList' are containers, listItem gets the handle
]);

interface BlockInfo {
  pos: number;
  node: ProseMirrorNode;
  dom: HTMLElement;
  depth: number;
}

/**
 * Create the handle container with + button and 6-dot drag handle
 */
function createBlockHandleContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'block-handle-container';

  // + button (add block below)
  const addBtn = document.createElement('button');
  addBtn.className = 'block-add-btn';
  addBtn.innerHTML = '+';
  addBtn.title = '下にブロックを追加';
  container.appendChild(addBtn);

  // 6-dot drag handle
  const handle = document.createElement('div');
  handle.className = 'block-handle';
  handle.innerHTML = icons.gripVertical;
  handle.title = 'ドラッグで移動 / クリックでメニュー';
  handle.draggable = true;
  container.appendChild(handle);

  return container;
}

/**
 * Create context menu for block operations
 * Note: visibility is controlled via .is-visible CSS class (CSP-safe)
 */
function createBlockContextMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'block-context-menu';
  return menu;
}

/**
 * Create context menu item
 */
function createMenuItem(label: string, action: string, icon?: string): HTMLElement {
  const item = document.createElement('button');
  item.className = 'block-context-menu-item';
  item.dataset.action = action;
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'block-context-menu-icon';
    iconSpan.innerHTML = icon;
    item.appendChild(iconSpan);
  }
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  item.appendChild(labelSpan);
  return item;
}

/**
 * Create block type menu for + button
 */
function createBlockTypeMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'block-type-menu';
  return menu;
}

/**
 * Block type definitions with keywords for filtering
 */
interface BlockTypeDefinition {
  icon: string;
  label: string;
  blockType: string;
  keywords: string[];
}

/**
 * Create block type menu item
 */
function createBlockTypeItem(icon: string, label: string, blockType: string): HTMLElement {
  const item = document.createElement('button');
  item.className = 'block-type-menu-item';
  item.dataset.blockType = blockType;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'block-type-menu-icon';
  iconSpan.textContent = icon;
  item.appendChild(iconSpan);

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  item.appendChild(labelSpan);

  return item;
}


/**
 * Create drop indicator element
 * Note: visibility is controlled via .is-visible CSS class (CSP-safe)
 */
function createDropIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
  return indicator;
}

export interface BlockHandlesOptions {
  // Future options
}

export interface BlockHandlesStorage {
  blockTypeMenu: HTMLElement | null;
  showBlockTypeMenu: ((x: number, y: number, filterText?: string) => void) | null;
  hideBlockTypeMenu: (() => void) | null;
  slashCommandRange: { from: number; to: number } | null;
  selectedMenuIndex: number;
  menuItemCount: number;
  selectPrevMenuItem: (() => void) | null;
  selectNextMenuItem: (() => void) | null;
  selectCurrentMenuItem: (() => void) | null;
  isMenuVisible: () => boolean;
}

export const BlockHandles = Extension.create<BlockHandlesOptions, BlockHandlesStorage>({
  name: 'blockHandles',

  addStorage() {
    return {
      blockTypeMenu: null,
      showBlockTypeMenu: null,
      hideBlockTypeMenu: null,
      slashCommandRange: null,
      selectedMenuIndex: -1,
      menuItemCount: 0,
      selectPrevMenuItem: null,
      selectNextMenuItem: null,
      selectCurrentMenuItem: null,
      isMenuVisible: () => false,
    };
  },

  addKeyboardShortcuts() {
    return {
      'Escape': () => {
        // Hide menu on Escape
        if (this.storage.isMenuVisible()) {
          if (this.storage.hideBlockTypeMenu) {
            this.storage.hideBlockTypeMenu();
            this.storage.slashCommandRange = null;
          }
          return true; // Handled
        }
        return false;
      },
      'ArrowUp': () => {
        // Move selection up in menu
        if (this.storage.isMenuVisible() && this.storage.selectPrevMenuItem) {
          this.storage.selectPrevMenuItem();
          return true; // Handled
        }
        return false;
      },
      'ArrowDown': () => {
        // Move selection down in menu
        if (this.storage.isMenuVisible() && this.storage.selectNextMenuItem) {
          this.storage.selectNextMenuItem();
          return true; // Handled
        }
        return false;
      },
      'Enter': () => {
        // Select current menu item
        if (this.storage.isMenuVisible() && this.storage.selectCurrentMenuItem) {
          this.storage.selectCurrentMenuItem();
          return true; // Handled
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const storage = this.storage;
    let handle: HTMLElement | null = null;
    let contextMenu: HTMLElement | null = null;
    let blockTypeMenu: HTMLElement | null = null;
    let dropIndicator: HTMLElement | null = null;
    let currentBlockInfo: BlockInfo | null = null;
    let lastValidBlockInfo: BlockInfo | null = null; // Backup for drag operations
    let hideTimeoutId: number | null = null;
    let isDragging = false;
    let dragSourceInfo: BlockInfo | null = null;

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
          handle.classList.remove('is-visible');
        }
        DEBUG.log(MODULE, 'scheduleHide timeout fired, clearing currentBlockInfo');
        currentBlockInfo = null;
        hideTimeoutId = null;
      }, HIDE_DELAY_MS);
    };

    const showHandle = () => {
      cancelHideTimeout();
      if (handle) {
        handle.classList.add('is-visible');
      }
    };

    const hideContextMenu = () => {
      if (contextMenu) {
        contextMenu.classList.remove('is-visible');
      }
    };

    const hideBlockTypeMenu = () => {
      if (blockTypeMenu) {
        blockTypeMenu.classList.remove('is-visible');
        storage.selectedMenuIndex = -1;
        storage.menuItemCount = 0;
        // Notify extension about menu state change
        notifyMenuStateChange(false);
      }
    };

    // Notify VS Code extension about menu visibility change
    const notifyMenuStateChange = (visible: boolean) => {
      // Post message to extension for context key management
      const vscode = (window as unknown as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;
      if (vscode) {
        vscode.postMessage({
          type: 'menuStateChange',
          visible,
        });
      }
    };

    // Update selection highlight in menu
    const updateMenuSelection = () => {
      if (!blockTypeMenu) return;

      const items = blockTypeMenu.querySelectorAll('.block-type-menu-item');
      items.forEach((item, index) => {
        if (index === storage.selectedMenuIndex) {
          item.classList.add('is-selected');
          // Scroll into view if needed
          (item as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('is-selected');
        }
      });
    };

    // Navigate to previous menu item
    const selectPrevMenuItem = () => {
      if (storage.menuItemCount === 0) return;

      if (storage.selectedMenuIndex <= 0) {
        storage.selectedMenuIndex = storage.menuItemCount - 1;
      } else {
        storage.selectedMenuIndex--;
      }
      updateMenuSelection();
      DEBUG.log(MODULE, 'Menu selection prev', { index: storage.selectedMenuIndex });
    };

    // Navigate to next menu item
    const selectNextMenuItem = () => {
      if (storage.menuItemCount === 0) return;

      if (storage.selectedMenuIndex >= storage.menuItemCount - 1) {
        storage.selectedMenuIndex = 0;
      } else {
        storage.selectedMenuIndex++;
      }
      updateMenuSelection();
      DEBUG.log(MODULE, 'Menu selection next', { index: storage.selectedMenuIndex });
    };

    // Select current menu item (trigger action)
    const selectCurrentMenuItem = () => {
      if (!blockTypeMenu || storage.selectedMenuIndex < 0) return;

      const items = blockTypeMenu.querySelectorAll('.block-type-menu-item');
      const selectedItem = items[storage.selectedMenuIndex] as HTMLElement;

      if (selectedItem) {
        selectedItem.click();
        DEBUG.log(MODULE, 'Menu item selected via keyboard', { index: storage.selectedMenuIndex });
      }
    };

    // Check if menu is visible
    const isMenuVisible = () => {
      return blockTypeMenu?.classList.contains('is-visible') ?? false;
    };

    // Block type definitions with keywords for slash command filtering
    const getBlockTypes = (): BlockTypeDefinition[] => {
      const fm = t().floatingMenu;
      return [
        { icon: 'H1', label: fm.heading1, blockType: 'heading1', keywords: ['heading', 'h1', '見出し', 'midashi'] },
        { icon: 'H2', label: fm.heading2, blockType: 'heading2', keywords: ['heading', 'h2', '見出し', 'midashi'] },
        { icon: 'H3', label: fm.heading3, blockType: 'heading3', keywords: ['heading', 'h3', '見出し', 'midashi'] },
        { icon: '•', label: fm.bulletList, blockType: 'bulletList', keywords: ['bullet', 'list', 'ul', '箇条書き', 'リスト'] },
        { icon: '1.', label: fm.orderedList, blockType: 'orderedList', keywords: ['ordered', 'number', 'ol', '番号', 'リスト'] },
        { icon: '{ }', label: fm.codeBlock, blockType: 'codeBlock', keywords: ['code', 'コード', 'pre'] },
        { icon: '>', label: fm.blockquote, blockType: 'blockquote', keywords: ['quote', '引用', 'blockquote'] },
        { icon: '⊞', label: fm.table, blockType: 'table', keywords: ['table', 'テーブル', '表'] },
      ];
    };

    const showBlockTypeMenu = (x: number, y: number, filterText?: string) => {
      if (!blockTypeMenu) return;

      blockTypeMenu.innerHTML = '';

      // Get all block types and filter by search text
      let blockTypes = getBlockTypes();

      if (filterText && filterText.length > 0) {
        const lowerFilter = filterText.toLowerCase();
        blockTypes = blockTypes.filter(bt =>
          bt.label.toLowerCase().includes(lowerFilter) ||
          bt.keywords.some(kw => kw.toLowerCase().includes(lowerFilter))
        );
      }

      // If no matches, hide menu
      if (blockTypes.length === 0) {
        blockTypeMenu.classList.remove('is-visible');
        storage.menuItemCount = 0;
        storage.selectedMenuIndex = -1;
        notifyMenuStateChange(false);
        return;
      }

      // Add filtered items
      blockTypes.forEach(bt => {
        blockTypeMenu.appendChild(createBlockTypeItem(bt.icon, bt.label, bt.blockType));
      });

      // Update storage with item count
      storage.menuItemCount = blockTypes.length;

      // Reset selection to first item when menu opens
      storage.selectedMenuIndex = 0;
      updateMenuSelection();

      // Position menu
      const menuWidth = 200;
      const menuHeight = Math.min(blockTypes.length * 32 + 8, 300);
      const menuX = Math.min(x, window.innerWidth - menuWidth - 10);
      const menuY = Math.min(y, window.innerHeight - menuHeight - 10);

      blockTypeMenu.style.setProperty('--menu-x', `${menuX}px`);
      blockTypeMenu.style.setProperty('--menu-y', `${menuY}px`);
      blockTypeMenu.classList.add('is-visible');

      // Notify extension about menu state change
      notifyMenuStateChange(true);
    };

    /**
     * Find the block element containing a DOM target
     * Two strategies:
     * 1. DOM-based: Walk up from target element to find block
     * 2. Position-based: Use posAtCoords as fallback
     */
    const findBlockFromDOM = (view: EditorView, target: HTMLElement): BlockInfo | null => {
      // Walk up the DOM tree to find a block-level element
      let current: HTMLElement | null = target;

      while (current && current !== view.dom) {
        // Check if this is a ProseMirror node
        const pos = view.posAtDOM(current, 0);
        if (pos !== null && pos >= 0) {
          try {
            const $pos = view.state.doc.resolve(pos);

            // Find the block node at or above this position
            for (let depth = $pos.depth; depth >= 1; depth--) {
              const node = $pos.node(depth);

              if (!HANDLE_BLOCK_TYPES.has(node.type.name)) continue;

              // Get the start position of this node
              const nodeStart = $pos.before(depth);
              const dom = view.nodeDOM(nodeStart) as HTMLElement | null;

              if (dom && dom !== view.dom) {
                DEBUG.log(MODULE, 'Found block from DOM', { type: node.type.name, depth, pos: nodeStart });
                return { pos: nodeStart, node, dom, depth };
              }
            }
          } catch {
            // Invalid position, continue walking up
          }
        }
        current = current.parentElement;
      }

      return null;
    };

    /**
     * Find block at coordinates (fallback for when DOM method fails)
     */
    const findBlockAtCoords = (view: EditorView, coords: { x: number; y: number }): BlockInfo | null => {
      const posInfo = view.posAtCoords({ left: coords.x, top: coords.y });
      if (!posInfo) return null;

      const doc = view.state.doc;
      const $pos = doc.resolve(posInfo.pos);

      // Walk from current depth upward to find the closest block-level node
      for (let depth = $pos.depth; depth >= 1; depth--) {
        const node = $pos.node(depth);

        // Check if this is a block type we want to show handles for
        if (!HANDLE_BLOCK_TYPES.has(node.type.name)) continue;

        const nodeStart = $pos.before(depth);
        const dom = view.nodeDOM(nodeStart) as HTMLElement | null;

        // Ensure we got the actual block DOM, not the editor root
        if (dom && dom !== view.dom) {
          DEBUG.log(MODULE, 'Found block at coords', { type: node.type.name, depth, pos: nodeStart });
          return { pos: nodeStart, node, dom, depth };
        }
      }

      return null;
    };

    /**
     * Show context menu with simple options: Delete, Copy
     */
    const showContextMenu = (x: number, y: number, blockInfo: BlockInfo) => {
      if (!contextMenu) return;

      DEBUG.log(MODULE, 'Showing context menu', { type: blockInfo.node.type.name, pos: blockInfo.pos });
      contextMenu.innerHTML = '';

      const bh = t().blockHandles;

      // Delete option
      contextMenu.appendChild(createMenuItem(bh.delete, 'delete', icons.trash));

      // Copy option (uses clipboard API)
      contextMenu.appendChild(createMenuItem(bh.copy, 'copy', icons.copy));

      // Position menu in viewport using CSS variables (CSP-safe)
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 180;
      const menuHeight = 150;

      let menuX = x;
      let menuY = y;

      if (x + menuWidth > viewportWidth) {
        menuX = viewportWidth - menuWidth - 10;
      }
      if (y + menuHeight > viewportHeight) {
        menuY = viewportHeight - menuHeight - 10;
      }

      contextMenu.style.setProperty('--menu-x', `${menuX}px`);
      contextMenu.style.setProperty('--menu-y', `${menuY}px`);
      contextMenu.classList.add('is-visible');
    };

    /**
     * Delete block
     */
    const deleteBlock = (blockInfo: BlockInfo) => {
      const { state, dispatch } = editor.view;
      const { tr } = state;

      const nodeSize = blockInfo.node.nodeSize;
      dispatch(tr.delete(blockInfo.pos, blockInfo.pos + nodeSize));
      DEBUG.log(MODULE, 'Deleted block', { pos: blockInfo.pos });
    };

    const handleContextMenuAction = async (action: string, blockInfo: BlockInfo) => {
      if (action === 'delete') {
        deleteBlock(blockInfo);
      } else if (action === 'copy') {
        // Copy block content to clipboard
        const text = blockInfo.dom.textContent || '';
        try {
          await navigator.clipboard.writeText(text);
          DEBUG.log(MODULE, 'Copied to clipboard', { length: text.length });
        } catch (err) {
          DEBUG.error(MODULE, 'Failed to copy', err);
        }
      }
      hideContextMenu();
    };

    /**
     * Update handle position for a block
     */
    const updateHandlePosition = (view: EditorView, blockInfo: BlockInfo) => {
      if (!handle) return;

      const blockRect = blockInfo.dom.getBoundingClientRect();

      // Fixed positioning: use viewport coordinates directly
      // Place handle to the left of the block using CSS variables (CSP-safe)
      const left = blockRect.left - HANDLE_WIDTH - HANDLE_OFFSET - 20; // 20px extra margin
      const top = blockRect.top + (blockRect.height - HANDLE_HEIGHT) / 2;

      handle.style.setProperty('--handle-x', `${Math.max(8, left)}px`);
      handle.style.setProperty('--handle-y', `${top}px`);
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

          // Create handle container (+ button and 6-dot handle)
          // Use body for fixed positioning
          handle = createBlockHandleContainer();
          document.body.appendChild(handle);

          // Get references to child elements
          const addBtn = handle.querySelector('.block-add-btn') as HTMLElement;
          const dragHandle = handle.querySelector('.block-handle') as HTMLElement;

          // Create context menu
          contextMenu = createBlockContextMenu();
          document.body.appendChild(contextMenu);

          // Create block type menu
          blockTypeMenu = createBlockTypeMenu();
          document.body.appendChild(blockTypeMenu);

          // Store references in extension storage for keyboard shortcut access
          storage.blockTypeMenu = blockTypeMenu;
          storage.showBlockTypeMenu = showBlockTypeMenu;
          storage.hideBlockTypeMenu = hideBlockTypeMenu;
          storage.selectPrevMenuItem = selectPrevMenuItem;
          storage.selectNextMenuItem = selectNextMenuItem;
          storage.selectCurrentMenuItem = selectCurrentMenuItem;
          storage.isMenuVisible = isMenuVisible;

          // Create drop indicator
          dropIndicator = createDropIndicator();
          editorContainer.appendChild(dropIndicator);

          // + button click handler - show block type menu
          const onAddBtnClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentBlockInfo) return;

            // Show block type menu at button position
            const btnRect = (e.target as HTMLElement).getBoundingClientRect();
            showBlockTypeMenu(btnRect.left, btnRect.bottom + 4);
          };

          // Block type menu click handler (handles both + button and slash command)
          const onBlockTypeMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.block-type-menu-item') as HTMLElement;
            if (!item) return;

            e.preventDefault();
            e.stopPropagation();

            const blockType = item.dataset.blockType;
            if (!blockType) return;

            // Check if this is from slash command or + button
            const slashRange = storage.slashCommandRange;

            if (slashRange) {
              // Slash command: delete "/" and search text, then convert current block
              DEBUG.log(MODULE, 'Slash command selection', { blockType, range: slashRange });

              // Delete the "/" and search text first
              editor.chain().focus().deleteRange({ from: slashRange.from, to: slashRange.to }).run();

              // Then apply the block transformation at current position
              switch (blockType) {
                case 'heading1':
                  editor.chain().focus().setHeading({ level: 1 }).run();
                  break;
                case 'heading2':
                  editor.chain().focus().setHeading({ level: 2 }).run();
                  break;
                case 'heading3':
                  editor.chain().focus().setHeading({ level: 3 }).run();
                  break;
                case 'bulletList':
                  editor.chain().focus().toggleBulletList().run();
                  break;
                case 'orderedList':
                  editor.chain().focus().toggleOrderedList().run();
                  break;
                case 'codeBlock':
                  editor.chain().focus().setCodeBlock().run();
                  break;
                case 'blockquote':
                  editor.chain().focus().setBlockquote().run();
                  break;
                case 'table':
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  break;
              }

              storage.slashCommandRange = null;
            } else if (currentBlockInfo) {
              // + button: insert new block after current block
              const pos = currentBlockInfo.pos + currentBlockInfo.node.nodeSize;

              switch (blockType) {
                case 'heading1':
                  editor.chain().focus().insertContentAt(pos, { type: 'heading', attrs: { level: 1 } }).setTextSelection(pos + 1).run();
                  break;
                case 'heading2':
                  editor.chain().focus().insertContentAt(pos, { type: 'heading', attrs: { level: 2 } }).setTextSelection(pos + 1).run();
                  break;
                case 'heading3':
                  editor.chain().focus().insertContentAt(pos, { type: 'heading', attrs: { level: 3 } }).setTextSelection(pos + 1).run();
                  break;
                case 'bulletList':
                  editor.chain().focus().insertContentAt(pos, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }).setTextSelection(pos + 3).run();
                  break;
                case 'orderedList':
                  editor.chain().focus().insertContentAt(pos, { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }).setTextSelection(pos + 3).run();
                  break;
                case 'codeBlock':
                  editor.chain().focus().insertContentAt(pos, { type: 'codeBlock' }).setTextSelection(pos + 1).run();
                  break;
                case 'blockquote':
                  editor.chain().focus().insertContentAt(pos, { type: 'blockquote', content: [{ type: 'paragraph' }] }).setTextSelection(pos + 2).run();
                  break;
                case 'table':
                  editor.chain().focus().setTextSelection(pos).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  break;
                default:
                  editor.chain().focus().insertContentAt(pos, { type: 'paragraph' }).setTextSelection(pos + 1).run();
              }
            }

            hideBlockTypeMenu();
          };

          addBtn?.addEventListener('click', onAddBtnClick);
          blockTypeMenu?.addEventListener('click', onBlockTypeMenuClick);

          // Mouse move handler
          const onMouseMove = (e: MouseEvent) => {
            if (isDragging) return;

            const target = e.target as HTMLElement;

            // Ignore if mouse is on handle container or context menu
            if (target.closest('.block-handle-container') || target.closest('.block-context-menu') || target.closest('.block-type-menu')) {
              cancelHideTimeout();
              return;
            }

            // Ignore if mouse is on table (TableControls handles tables)
            if (target.closest('table')) {
              scheduleHide();
              return;
            }

            // Ignore if mouse is on table controls
            if (target.closest('.table-add-row-btn') || target.closest('.table-add-col-btn') || target.closest('.table-context-menu')) {
              return;
            }

            // Try DOM-based detection first (more reliable for block hover)
            let blockInfo = findBlockFromDOM(view, target);

            // Fallback to coordinate-based detection
            if (!blockInfo) {
              blockInfo = findBlockAtCoords(view, { x: e.clientX, y: e.clientY });
            }

            if (blockInfo) {
              // Skip tables (handled by TableControls)
              if (blockInfo.node.type.name === 'table') {
                scheduleHide();
                return;
              }

              currentBlockInfo = blockInfo;
              lastValidBlockInfo = blockInfo; // Save backup for drag operations
              updateHandlePosition(view, blockInfo);
              showHandle();
            } else {
              scheduleHide();
            }
          };

          // Handle mouse enter/leave
          const onHandleMouseEnter = () => {
            DEBUG.log(MODULE, 'Handle mouseenter', { hasCurrentBlockInfo: !!currentBlockInfo });
            cancelHideTimeout();
            showHandle();
          };

          const onHandleMouseLeave = () => {
            DEBUG.log(MODULE, 'Handle mouseleave', { isDragging });
            if (!isDragging) {
              scheduleHide();
            }
          };

          // Handle left-click on drag handle to show menu
          const onHandleClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentBlockInfo) return;
            showContextMenu(e.clientX, e.clientY, currentBlockInfo);
          };

          // Context menu click handler
          const onContextMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.block-context-menu-item') as HTMLElement;
            if (item && currentBlockInfo) {
              e.preventDefault();
              e.stopPropagation();
              const action = item.dataset.action;
              if (action) {
                handleContextMenuAction(action, currentBlockInfo);
              }
            }
          };

          // Close context menu on document click
          const onDocumentClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.block-context-menu')) {
              hideContextMenu();
            }
            if (!target.closest('.block-type-menu') && !target.closest('.block-add-btn')) {
              hideBlockTypeMenu();
            }
          };

          // Drag start handler
          const onDragStart = (e: DragEvent) => {
            // Use lastValidBlockInfo as fallback when currentBlockInfo is cleared by scheduleHide timeout
            const blockInfo = currentBlockInfo || lastValidBlockInfo;
            DEBUG.log(MODULE, 'onDragStart called', {
              hasCurrentBlockInfo: !!currentBlockInfo,
              hasLastValidBlockInfo: !!lastValidBlockInfo,
              usingFallback: !currentBlockInfo && !!lastValidBlockInfo
            });
            if (!blockInfo) {
              DEBUG.warn(MODULE, 'Drag start aborted: no block info available');
              return;
            }

            isDragging = true;
            dragSourceInfo = blockInfo;

            // Set drag data
            e.dataTransfer?.setData('text/plain', '');
            e.dataTransfer!.effectAllowed = 'move';

            // Create drag image using CSS class (CSP-safe)
            const dragImage = blockInfo.dom.cloneNode(true) as HTMLElement;
            dragImage.className = 'block-drag-image';
            document.body.appendChild(dragImage);
            e.dataTransfer?.setDragImage(dragImage, 20, 20);
            setTimeout(() => dragImage.remove(), 0);

            // Add dragging class to source
            blockInfo.dom.classList.add('is-dragging');
            DEBUG.log(MODULE, 'Drag started', { pos: dragSourceInfo.pos, type: dragSourceInfo.node.type.name });
          };

          // Drag over handler
          const onDragOver = (e: DragEvent) => {
            if (!isDragging || !dragSourceInfo) return;

            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';

            const blockInfo = findBlockAtCoords(view, { x: e.clientX, y: e.clientY });
            if (blockInfo && dropIndicator) {
              const rect = blockInfo.dom.getBoundingClientRect();
              const containerRect = editorContainer.getBoundingClientRect();
              const midY = rect.top + rect.height / 2;

              // Show indicator above or below based on mouse position
              const indicatorTop = e.clientY < midY
                ? rect.top - containerRect.top + editorContainer.scrollTop - 1
                : rect.bottom - containerRect.top + editorContainer.scrollTop - 1;

              // CSP-safe: use CSS variable for position, class for visibility
              dropIndicator.style.setProperty('--indicator-top', `${indicatorTop}px`);
              dropIndicator.classList.add('is-visible');
            }
          };

          // Drag leave handler
          const onDragLeave = () => {
            if (dropIndicator) {
              dropIndicator.classList.remove('is-visible');
            }
          };

          // Drop handler
          const onDrop = (e: DragEvent) => {
            e.preventDefault();
            if (!isDragging || !dragSourceInfo) return;

            if (dropIndicator) {
              dropIndicator.classList.remove('is-visible');
            }

            const targetInfo = findBlockAtCoords(view, { x: e.clientX, y: e.clientY });
            if (targetInfo && targetInfo.pos !== dragSourceInfo.pos) {
              const { state, dispatch } = view;
              const { tr } = state;

              const sourcePos = dragSourceInfo.pos;
              const sourceNode = dragSourceInfo.node;
              const sourceNodeSize = sourceNode.nodeSize;

              const targetRect = targetInfo.dom.getBoundingClientRect();
              const insertBefore = e.clientY < targetRect.top + targetRect.height / 2;

              // Calculate insert position
              let insertPos: number;
              if (insertBefore) {
                insertPos = targetInfo.pos;
              } else {
                insertPos = targetInfo.pos + targetInfo.node.nodeSize;
              }

              // Adjust for deletion
              if (sourcePos < insertPos) {
                insertPos -= sourceNodeSize;
              }

              if (sourcePos !== insertPos) {
                const newTr = tr
                  .delete(sourcePos, sourcePos + sourceNodeSize)
                  .insert(insertPos, sourceNode);
                dispatch(newTr);
                DEBUG.log(MODULE, 'Block dropped', { from: sourcePos, to: insertPos });
              }
            }

            // Reset drag state
            if (dragSourceInfo?.dom) {
              dragSourceInfo.dom.classList.remove('is-dragging');
            }
            isDragging = false;
            dragSourceInfo = null;
          };

          // Drag end handler
          const onDragEnd = () => {
            if (dragSourceInfo?.dom) {
              dragSourceInfo.dom.classList.remove('is-dragging');
            }
            isDragging = false;
            dragSourceInfo = null;
            if (dropIndicator) {
              dropIndicator.classList.remove('is-visible');
            }
            scheduleHide();
          };

          // Scroll handler
          const onScroll = () => {
            if (currentBlockInfo && handle?.classList.contains('is-visible')) {
              updateHandlePosition(view, currentBlockInfo);
            }
          };

          // Add event listeners
          view.dom.addEventListener('mousemove', onMouseMove);
          handle?.addEventListener('mouseenter', onHandleMouseEnter);
          handle?.addEventListener('mouseleave', onHandleMouseLeave);
          dragHandle?.addEventListener('click', onHandleClick);
          dragHandle?.addEventListener('dragstart', onDragStart);
          dragHandle?.addEventListener('dragend', onDragEnd);
          editorContainer.addEventListener('dragover', onDragOver);
          editorContainer.addEventListener('dragleave', onDragLeave);
          editorContainer.addEventListener('drop', onDrop);
          contextMenu?.addEventListener('click', onContextMenuClick);
          document.addEventListener('click', onDocumentClick);
          editorContainer.addEventListener('scroll', onScroll);

          return {
            update(view) {
              // Update block handle position if visible
              if (currentBlockInfo && handle?.classList.contains('is-visible')) {
                // Re-find the block in case positions changed
                const dom = view.nodeDOM(currentBlockInfo.pos) as HTMLElement | null;
                if (dom) {
                  currentBlockInfo.dom = dom;
                  updateHandlePosition(view, currentBlockInfo);
                }
              }

              // Slash command detection: check if we're in a paragraph with "/" before cursor
              const { $from, empty } = view.state.selection;
              if (!empty) {
                // Selection is not collapsed, hide menu
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              // Get text before cursor in current text block
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

              // Find the last "/" in the text before cursor
              const slashIndex = textBefore.lastIndexOf('/');

              if (slashIndex === -1) {
                // No slash found, hide menu if it was showing
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              // Check if there's a space between "/" and cursor (means command was cancelled)
              const textAfterSlash = textBefore.slice(slashIndex + 1);
              if (textAfterSlash.includes(' ')) {
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              // Calculate absolute positions for the slash command range
              const nodeStart = $from.pos - $from.parentOffset;
              const slashPos = nodeStart + slashIndex;
              const endPos = $from.pos;

              // Store the range for deletion when item is selected
              storage.slashCommandRange = { from: slashPos, to: endPos };

              // Get filter text (text after "/")
              const filterText = textAfterSlash;
              DEBUG.log(MODULE, 'Slash command active', { filterText, from: slashPos, to: endPos });

              // Show/update menu at cursor position
              const coords = view.coordsAtPos($from.pos);
              showBlockTypeMenu(coords.left, coords.bottom + 4, filterText);
            },
            destroy() {
              DEBUG.log(MODULE, 'Plugin destroyed');
              cancelHideTimeout();
              addBtn?.removeEventListener('click', onAddBtnClick);
              view.dom.removeEventListener('mousemove', onMouseMove);
              handle?.removeEventListener('mouseenter', onHandleMouseEnter);
              handle?.removeEventListener('mouseleave', onHandleMouseLeave);
              dragHandle?.removeEventListener('click', onHandleClick);
              dragHandle?.removeEventListener('dragstart', onDragStart);
              dragHandle?.removeEventListener('dragend', onDragEnd);
              editorContainer.removeEventListener('dragover', onDragOver);
              editorContainer.removeEventListener('dragleave', onDragLeave);
              editorContainer.removeEventListener('drop', onDrop);
              contextMenu?.removeEventListener('click', onContextMenuClick);
              blockTypeMenu?.removeEventListener('click', onBlockTypeMenuClick);
              document.removeEventListener('click', onDocumentClick);
              editorContainer.removeEventListener('scroll', onScroll);
              handle?.remove();
              contextMenu?.remove();
              blockTypeMenu?.remove();
              dropIndicator?.remove();
            },
          };
        },
      }),
    ];
  },
});
