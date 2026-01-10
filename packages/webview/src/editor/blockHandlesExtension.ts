/**
 * Block Handles Extension for Tiptap
 * Provides Notion-like block menus:
 * - + button for block-type menu
 * - Context menu on handle click (delete/copy)
 * - Slash command for block-type menu
 *
 * Note: Drag & drop is handled by InlineDragHandle (custom, listItem-aware).
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { DEBUG } from './debug.js';
import { t } from './i18n.js';
import { icons } from './icons.js';
import { createBlockMenu, createBlockMenuItem, getBlockMenuItems, positionBlockMenu, updateBlockMenuSelection } from './blockMenu.js';
import { closeMenu, isMenuActive, openMenu, registerMenu } from './menuManager.js';

const MODULE = 'BlockHandles';

export const BlockHandlesPluginKey = new PluginKey('blockHandles');

export const DRAG_HANDLE_ALLOWED_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'rawBlock',
  'htmlBlock',
]);

export const isDragHandleTarget = (node: ProseMirrorNode | null): boolean => {
  if (!node) return false;
  if (node.type.name === 'table') return false;
  if (node.type.spec.tableRole) return false;
  return DRAG_HANDLE_ALLOWED_NODE_TYPES.has(node.type.name);
};

export const createDragHandleElement = (): HTMLElement => {
  const container = document.createElement('div');
  container.className = 'block-handle-container';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'block-add-btn';
  addBtn.textContent = '+';
  addBtn.title = '下にブロックを追加';
  addBtn.draggable = false;
  addBtn.addEventListener('dragstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  addBtn.addEventListener('mousedown', (e) => {
    // Prevent drag start from the add button
    e.stopPropagation();
  });
  container.appendChild(addBtn);

  const handle = document.createElement('div');
  handle.className = 'block-handle';
  handle.innerHTML = icons.gripVertical;
  handle.title = 'ドラッグで移動 / クリックでメニュー';
  container.appendChild(handle);

  return container;
};

interface BlockTypeDefinition {
  icon: string;
  label: string;
  blockType: string;
  keywords: string[];
}

export interface BlockHandlesStorage {
  blockTypeMenu: HTMLElement | null;
  showBlockTypeMenu: ((x: number, y: number, filterText?: string) => void) | null;
  hideBlockTypeMenu: (() => void) | null;
  hideContextMenu: (() => void) | null;
  slashCommandRange: { from: number; to: number } | null;
  // Block type menu state
  selectedMenuIndex: number;
  menuItemCount: number;
  // Context menu state
  selectedContextIndex: number;
  contextItemCount: number;
  // Unified menu navigation
  selectPrevMenuItem: (() => void) | null;
  selectNextMenuItem: (() => void) | null;
  selectCurrentMenuItem: (() => void) | null;
  isMenuVisible: () => boolean;
  getActiveMenuType: () => 'blockType' | 'blockContext' | null;
  // Active node from InlineDragHandle
  currentNode: ProseMirrorNode | null;
  currentNodePos: number;
  setActiveNode: (node: ProseMirrorNode | null, pos: number) => void;
}

export type BlockHandlesOptions = Record<string, never>;

export const BlockHandles = Extension.create<BlockHandlesOptions, BlockHandlesStorage>({
  name: 'blockHandles',

  addStorage() {
    return {
      blockTypeMenu: null,
      showBlockTypeMenu: null,
      hideBlockTypeMenu: null,
      hideContextMenu: null,
      slashCommandRange: null,
      selectedMenuIndex: -1,
      menuItemCount: 0,
      selectedContextIndex: -1,
      contextItemCount: 0,
      selectPrevMenuItem: null,
      selectNextMenuItem: null,
      selectCurrentMenuItem: null,
      isMenuVisible: () => false,
      getActiveMenuType: () => null,
      currentNode: null,
      currentNodePos: -1,
      setActiveNode(node, pos) {
        const allowed = isDragHandleTarget(node);
        if (!allowed) {
          this.currentNode = null;
          this.currentNodePos = -1;
          return;
        }
        this.currentNode = node;
        this.currentNodePos = pos;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Escape': () => {
        const activeMenu = this.storage.getActiveMenuType();
        if (activeMenu === 'blockType' && this.storage.hideBlockTypeMenu) {
          this.storage.hideBlockTypeMenu();
          this.storage.slashCommandRange = null;
          return true;
        }
        if (activeMenu === 'blockContext' && this.storage.hideContextMenu) {
          this.storage.hideContextMenu();
          return true;
        }
        return false;
      },
      'ArrowUp': () => {
        if (this.storage.isMenuVisible() && this.storage.selectPrevMenuItem) {
          this.storage.selectPrevMenuItem();
          return true;
        }
        return false;
      },
      'ArrowDown': () => {
        if (this.storage.isMenuVisible() && this.storage.selectNextMenuItem) {
          this.storage.selectNextMenuItem();
          return true;
        }
        return false;
      },
      'Enter': () => {
        if (this.storage.isMenuVisible() && this.storage.selectCurrentMenuItem) {
          this.storage.selectCurrentMenuItem();
          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const storage = this.storage;
    let contextMenu: HTMLElement | null = null;
    let blockTypeMenu: HTMLElement | null = null;
    let isDragHandleLocked = false;

    const getActiveBlock = () => {
      if (!storage.currentNode || storage.currentNodePos < 0) return null;
      return { node: storage.currentNode, pos: storage.currentNodePos };
    };

    const syncDragHandleLock = () => {
      const shouldLock = isMenuActive();
      if (shouldLock === isDragHandleLocked) {
        return;
      }
      isDragHandleLocked = shouldLock;
      if (shouldLock) {
        editor.commands.lockDragHandle?.();
      } else {
        editor.commands.unlockDragHandle?.();
      }
    };

    const hideContextMenu = () => {
      if (contextMenu) {
        contextMenu.classList.remove('is-visible');
        storage.selectedContextIndex = -1;
        storage.contextItemCount = 0;
        closeMenu('blockContext', { skipHide: true });
        syncDragHandleLock();
      }
    };

    const hideBlockTypeMenu = () => {
      if (blockTypeMenu) {
        blockTypeMenu.classList.remove('is-visible');
        storage.selectedMenuIndex = -1;
        storage.menuItemCount = 0;
        closeMenu('blockType', { skipHide: true });
        syncDragHandleLock();
      }
    };

    const updateBlockTypeMenuSelection = () => {
      updateBlockMenuSelection(blockTypeMenu, storage.selectedMenuIndex);
    };

    const updateContextMenuSelection = () => {
      updateBlockMenuSelection(contextMenu, storage.selectedContextIndex);
    };

    const getActiveMenuType = (): 'blockType' | 'blockContext' | null => {
      if (isMenuActive('blockType')) return 'blockType';
      if (isMenuActive('blockContext')) return 'blockContext';
      return null;
    };

    const isAnyMenuVisible = () => {
      return isMenuActive('blockType') || isMenuActive('blockContext');
    };

    const selectPrevMenuItem = () => {
      const activeMenu = getActiveMenuType();
      if (activeMenu === 'blockType') {
        if (storage.menuItemCount === 0) return;
        storage.selectedMenuIndex =
          storage.selectedMenuIndex <= 0 ? storage.menuItemCount - 1 : storage.selectedMenuIndex - 1;
        updateBlockTypeMenuSelection();
        DEBUG.log(MODULE, 'Block type menu selection prev', { index: storage.selectedMenuIndex });
      } else if (activeMenu === 'blockContext') {
        if (storage.contextItemCount === 0) return;
        storage.selectedContextIndex =
          storage.selectedContextIndex <= 0 ? storage.contextItemCount - 1 : storage.selectedContextIndex - 1;
        updateContextMenuSelection();
        DEBUG.log(MODULE, 'Context menu selection prev', { index: storage.selectedContextIndex });
      }
    };

    const selectNextMenuItem = () => {
      const activeMenu = getActiveMenuType();
      if (activeMenu === 'blockType') {
        if (storage.menuItemCount === 0) return;
        storage.selectedMenuIndex =
          storage.selectedMenuIndex >= storage.menuItemCount - 1 ? 0 : storage.selectedMenuIndex + 1;
        updateBlockTypeMenuSelection();
        DEBUG.log(MODULE, 'Block type menu selection next', { index: storage.selectedMenuIndex });
      } else if (activeMenu === 'blockContext') {
        if (storage.contextItemCount === 0) return;
        storage.selectedContextIndex =
          storage.selectedContextIndex >= storage.contextItemCount - 1 ? 0 : storage.selectedContextIndex + 1;
        updateContextMenuSelection();
        DEBUG.log(MODULE, 'Context menu selection next', { index: storage.selectedContextIndex });
      }
    };

    const selectCurrentMenuItem = () => {
      const activeMenu = getActiveMenuType();
      if (activeMenu === 'blockType') {
        if (!blockTypeMenu || storage.selectedMenuIndex < 0) return;
        const items = getBlockMenuItems(blockTypeMenu);
        const selectedItem = items[storage.selectedMenuIndex] as HTMLElement;
        selectedItem?.click();
        DEBUG.log(MODULE, 'Block type menu item selected via keyboard', { index: storage.selectedMenuIndex });
      } else if (activeMenu === 'blockContext') {
        if (!contextMenu || storage.selectedContextIndex < 0) return;
        const items = getBlockMenuItems(contextMenu);
        const selectedItem = items[storage.selectedContextIndex] as HTMLElement;
        selectedItem?.click();
        DEBUG.log(MODULE, 'Context menu item selected via keyboard', { index: storage.selectedContextIndex });
      }
    };

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

    const createBlockTypeItem = (icon: string, label: string, blockType: string): HTMLElement => {
      return createBlockMenuItem({
        label,
        iconText: icon,
        blockType,
      });
    };

    const showBlockTypeMenu = (x: number, y: number, filterText?: string) => {
      if (!blockTypeMenu) return;

      blockTypeMenu.innerHTML = '';

      let blockTypes = getBlockTypes();

      if (filterText && filterText.length > 0) {
        const lowerFilter = filterText.toLowerCase();
        blockTypes = blockTypes.filter(bt =>
          bt.label.toLowerCase().includes(lowerFilter) ||
          bt.keywords.some(kw => kw.toLowerCase().includes(lowerFilter))
        );
      }

      if (blockTypes.length === 0) {
        blockTypeMenu.classList.remove('is-visible');
        storage.menuItemCount = 0;
        storage.selectedMenuIndex = -1;
        closeMenu('blockType');
        syncDragHandleLock();
        return;
      }

      blockTypes.forEach(bt => {
        blockTypeMenu.appendChild(createBlockTypeItem(bt.icon, bt.label, bt.blockType));
      });

      storage.menuItemCount = blockTypes.length;
      storage.selectedMenuIndex = 0;
      updateBlockTypeMenuSelection();

      const menuWidth = 200;
      const menuHeight = Math.min(blockTypes.length * 32 + 8, 300);
      const menuX = Math.min(x, window.innerWidth - menuWidth - 10);
      const menuY = Math.min(y, window.innerHeight - menuHeight - 10);

      positionBlockMenu(blockTypeMenu, {
        x: menuX,
        y: menuY,
        width: menuWidth,
        height: menuHeight,
      });
      blockTypeMenu.classList.add('is-visible');

      openMenu('blockType');
      syncDragHandleLock();
    };

    const createBlockContextMenu = (): HTMLElement => {
      return createBlockMenu('blockContext');
    };

    const createMenuItem = (label: string, action: string, icon?: string): HTMLElement => {
      return createBlockMenuItem({
        label,
        action,
        icon,
      });
    };

    const createBlockTypeMenu = (): HTMLElement => {
      return createBlockMenu('blockType');
    };

    const deleteBlock = (block: { node: ProseMirrorNode; pos: number }) => {
      const { node, pos } = block;
      editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
      DEBUG.log(MODULE, 'Deleted block', { pos, type: node.type.name });
    };

    const handleContextMenuAction = async (action: string, block: { node: ProseMirrorNode; pos: number }) => {
      if (action === 'delete') {
        deleteBlock(block);
      } else if (action === 'copy') {
        const text = editor.state.doc.textBetween(block.pos, block.pos + block.node.nodeSize, '\n\n');
        try {
          await navigator.clipboard.writeText(text);
          DEBUG.log(MODULE, 'Copied to clipboard', { length: text.length });
        } catch (err) {
          DEBUG.error(MODULE, 'Failed to copy', err);
        }
      }
      hideContextMenu();
    };

    const showContextMenu = (x: number, y: number, block: { node: ProseMirrorNode; pos: number }) => {
      if (!contextMenu) return;

      DEBUG.log(MODULE, 'Showing context menu', { type: block.node.type.name, pos: block.pos });
      contextMenu.innerHTML = '';

      const bh = t().blockHandles;
      contextMenu.appendChild(createMenuItem(bh.delete, 'delete', icons.trash));
      contextMenu.appendChild(createMenuItem(bh.copy, 'copy', icons.copy));

      storage.contextItemCount = 2;
      storage.selectedContextIndex = 0;
      updateContextMenuSelection();

      const menuWidth = 180;
      const menuHeight = 150;
      const menuX = Math.min(x, window.innerWidth - menuWidth - 10);
      const menuY = Math.min(y, window.innerHeight - menuHeight - 10);

      positionBlockMenu(contextMenu, {
        x: menuX,
        y: menuY,
        width: menuWidth,
        height: menuHeight,
      });
      contextMenu.classList.add('is-visible');

      openMenu('blockContext');
      syncDragHandleLock();
    };

    return [
      new Plugin({
        key: BlockHandlesPluginKey,
        view() {
          DEBUG.log(MODULE, 'Plugin initialized');

          contextMenu = createBlockContextMenu();
          document.body.appendChild(contextMenu);

          blockTypeMenu = createBlockTypeMenu();
          document.body.appendChild(blockTypeMenu);

          registerMenu('blockContext', hideContextMenu);
          registerMenu('blockType', hideBlockTypeMenu);

          storage.blockTypeMenu = blockTypeMenu;
          storage.showBlockTypeMenu = showBlockTypeMenu;
          storage.hideBlockTypeMenu = hideBlockTypeMenu;
          storage.hideContextMenu = hideContextMenu;
          storage.selectPrevMenuItem = selectPrevMenuItem;
          storage.selectNextMenuItem = selectNextMenuItem;
          storage.selectCurrentMenuItem = selectCurrentMenuItem;
          storage.isMenuVisible = isAnyMenuVisible;
          storage.getActiveMenuType = getActiveMenuType;

          const onBlockTypeMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.block-menu-item') as HTMLElement;
            if (!item) return;

            e.preventDefault();
            e.stopPropagation();

            const blockType = item.dataset.blockType;
            if (!blockType) return;

            const slashRange = storage.slashCommandRange;

            if (slashRange) {
              DEBUG.log(MODULE, 'Slash command selection', { blockType, range: slashRange });
              editor.chain().focus().deleteRange({ from: slashRange.from, to: slashRange.to }).run();

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
            } else {
              const active = getActiveBlock();
              if (!active) {
                DEBUG.warn(MODULE, 'Block type menu selection ignored: no active block');
                return;
              }

              const pos = active.pos + active.node.nodeSize;

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

          const onContextMenuClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.block-menu-item') as HTMLElement;
            const active = getActiveBlock();
            if (item && active) {
              e.preventDefault();
              e.stopPropagation();
              const action = item.dataset.action;
              if (action) {
                handleContextMenuAction(action, active);
              }
            }
          };

          const onDocumentClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            const addBtn = target.closest('.block-add-btn') as HTMLElement | null;
            if (addBtn) {
              e.preventDefault();
              e.stopPropagation();
              storage.slashCommandRange = null;
              if (!getActiveBlock()) {
                DEBUG.warn(MODULE, 'Add button click ignored: no active block');
                return;
              }
              const btnRect = addBtn.getBoundingClientRect();
              showBlockTypeMenu(btnRect.left, btnRect.bottom + 4);
              return;
            }

            const handleBtn = target.closest('.block-handle') as HTMLElement | null;
            if (handleBtn) {
              const active = getActiveBlock();
              if (!active) {
                DEBUG.warn(MODULE, 'Handle click ignored: no active block');
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().setNodeSelection(active.pos).run();
              showContextMenu(e.clientX, e.clientY, active);
              return;
            }

            const contextMenuEl = target.closest('.block-menu[data-menu-type="blockContext"]');
            const blockTypeMenuEl = target.closest('.block-menu[data-menu-type="blockType"]');
            if (!contextMenuEl) {
              hideContextMenu();
            }
            if (!blockTypeMenuEl) {
              hideBlockTypeMenu();
            }
          };

          blockTypeMenu?.addEventListener('click', onBlockTypeMenuClick);
          contextMenu?.addEventListener('click', onContextMenuClick);
          document.addEventListener('click', onDocumentClick);

          return {
            update(view) {
              const { $from, empty } = view.state.selection;
              if (!empty) {
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
              const slashIndex = textBefore.lastIndexOf('/');

              if (slashIndex === -1) {
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              const charBeforeSlash = slashIndex > 0 ? textBefore[slashIndex - 1] : '';
              const isSlashTokenStart = slashIndex === 0 || /\s/.test(charBeforeSlash);
              if (!isSlashTokenStart) {
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              const textAfterSlash = textBefore.slice(slashIndex + 1);
              if (textAfterSlash.includes(' ')) {
                if (storage.slashCommandRange) {
                  hideBlockTypeMenu();
                  storage.slashCommandRange = null;
                }
                return;
              }

              const nodeStart = $from.pos - $from.parentOffset;
              const slashPos = nodeStart + slashIndex;
              const endPos = $from.pos;

              storage.slashCommandRange = { from: slashPos, to: endPos };

              const filterText = textAfterSlash;
              DEBUG.log(MODULE, 'Slash command active', { filterText, from: slashPos, to: endPos });

              const coords = view.coordsAtPos($from.pos);
              showBlockTypeMenu(coords.left, coords.bottom + 4, filterText);
            },
            destroy() {
              DEBUG.log(MODULE, 'Plugin destroyed');
              blockTypeMenu?.removeEventListener('click', onBlockTypeMenuClick);
              contextMenu?.removeEventListener('click', onContextMenuClick);
              document.removeEventListener('click', onDocumentClick);
              contextMenu?.remove();
              blockTypeMenu?.remove();
            },
          };
        },
      }),
    ];
  },
});
