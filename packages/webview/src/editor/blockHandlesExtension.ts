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
import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { DEBUG } from './debug.js';
import { t } from './i18n.js';
import { icons } from './icons.js';
import { createBlockMenu, createBlockMenuItem, getBlockMenuItems, positionBlockMenu, updateBlockMenuSelection } from './blockMenu.js';
import { closeMenu, isMenuActive, openMenu, registerMenu } from './menuManager.js';
import { executeCommand } from './commands.js';
import { normalizeIndentAttr } from './indentConfig.js';
import { notifyHostError } from './hostNotifier.js';
import { serializeMarkdown } from './markdownUtils.js';

const MODULE = 'BlockHandles';
const HANDLE_CLICK_THRESHOLD_PX = 4;

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

export const BlockHandlesPluginKey = new PluginKey('blockHandles');

export const DRAG_HANDLE_ALLOWED_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'codeBlock',
  'blockquote',
  'table',
  'horizontalRule',
  'rawBlock',
  'frontmatterBlock',
  'plainTextBlock',
  'nestedPage',
]);

export const isDragHandleTarget = (node: ProseMirrorNode | null): boolean => {
  if (!node) return false;
  if (node.type.spec.tableRole) return false;
  return DRAG_HANDLE_ALLOWED_NODE_TYPES.has(node.type.name);
};

const hasAncestor = ($pos: ResolvedPos, predicate: (node: ProseMirrorNode) => boolean): boolean => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) {
      return true;
    }
  }
  return false;
};

export type BlockHandleEligibility = {
  allowed: boolean;
  reason:
    | 'ok'
    | 'missing-getPos'
    | 'getPos-error'
    | 'pos-not-finite'
    | 'resolve-failed'
    | 'in-table'
    | 'in-list'
    | 'in-blockquote';
  pos: number | null;
  selfType?: string;
  inTableCell?: boolean;
  inListItem?: boolean;
  inBlockquote?: boolean;
  error?: string;
};

export const resolveBlockHandleEligibility = (
  state: { doc: ProseMirrorNode },
  getPos: (() => number) | false | undefined,
  selfType?: string
): BlockHandleEligibility => {
  if (!getPos) {
    return { allowed: false, reason: 'missing-getPos', pos: null, selfType };
  }

  let pos: number;
  try {
    pos = getPos();
  } catch (error) {
    return { allowed: false, reason: 'getPos-error', pos: null, selfType, error: String(error) };
  }

  if (!Number.isFinite(pos)) {
    return { allowed: false, reason: 'pos-not-finite', pos: Number.isFinite(pos) ? pos : null, selfType };
  }

  let resolved: ResolvedPos;
  try {
    resolved = state.doc.resolve(pos);
  } catch (error) {
    return { allowed: false, reason: 'resolve-failed', pos, selfType, error: String(error) };
  }

  const inTableCell = hasAncestor(resolved, (node) => Boolean(node.type.spec.tableRole));
  if (inTableCell) {
    return { allowed: false, reason: 'in-table', pos, selfType, inTableCell: true };
  }

  const inListItem = hasAncestor(resolved, (node) => node.type.name === 'listItem');
  if (inListItem && selfType !== 'listItem') {
    return { allowed: false, reason: 'in-list', pos, selfType, inListItem: true };
  }

  const inBlockquote = hasAncestor(resolved, (node) => node.type.name === 'blockquote');
  if (inBlockquote && selfType !== 'blockquote') {
    return { allowed: false, reason: 'in-blockquote', pos, selfType, inBlockquote: true };
  }

  return { allowed: true, reason: 'ok', pos, selfType };
};

export const shouldRenderBlockHandle = (
  state: { doc: ProseMirrorNode },
  getPos: (() => number) | false | undefined,
  selfType?: string
): boolean => {
  const eligibility = resolveBlockHandleEligibility(state, getPos, selfType);
  if (!eligibility.allowed && DEBUG.enabled) {
    switch (eligibility.reason) {
      case 'getPos-error':
        DEBUG.warn(MODULE, 'Block handle getPos failed', { error: eligibility.error, selfType });
        break;
      case 'pos-not-finite':
        DEBUG.warn(MODULE, 'Block handle pos not finite', { pos: eligibility.pos, selfType });
        break;
      case 'resolve-failed':
        DEBUG.warn(MODULE, 'Block handle resolve failed', { pos: eligibility.pos, error: eligibility.error, selfType });
        break;
      default:
        break;
    }
  }
  return eligibility.allowed;
};

export const createDragHandleElement = (): HTMLElement => {
  const container = document.createElement('span');
  container.className = 'block-handle-container';
  container.draggable = false;
  const labels = t().blockHandles;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'block-add-btn';
  addBtn.textContent = '+';
  addBtn.title = labels.addBlockBelow || 'Add block below';
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

  const handle = document.createElement('span');
  handle.className = 'block-handle';
  handle.innerHTML = icons.gripVertical;
  handle.title = labels.dragHandle || 'Drag to move / click for menu';
  handle.draggable = true;
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

export interface BlockHandlesOptions {
  createNestedPage?: (title: string) => Promise<{ path: string; title: string }>;
  openNestedPage?: (path: string) => void;
}

export const BlockHandles = Extension.create<BlockHandlesOptions, BlockHandlesStorage>({
  name: 'blockHandles',

  addOptions() {
    return {
      createNestedPage: undefined,
      openNestedPage: undefined,
    };
  },

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
    let contextMenuTargetPos: number | null = null;
    let blockTypeMenuTargetPos: number | null = null;
    let isDragHandleLocked = false;
    let pendingPointerAction: {
      kind: 'add' | 'handle';
      pointerId: number;
      startX: number;
      startY: number;
      element: HTMLElement;
    } | null = null;
    let suppressNextDocumentClick = false;

    const getActiveBlock = () => {
      if (!storage.currentNode || storage.currentNodePos < 0) return null;
      return { node: storage.currentNode, pos: storage.currentNodePos };
    };

    const resolveBlockFromHandleTarget = (target: HTMLElement | null) => {
      if (!target) return null;
      const container = target.closest('.block-handle-container') as HTMLElement | null;
      if (!container) return null;
      const resolvePosFromContainer = (): number | null => {
        const rawPos = Number(container.dataset.blockPos);
        let resolvedPos = Number.isFinite(rawPos) ? rawPos : null;
        try {
          const domPos = editor.view.posAtDOM(container, 0);
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
        } catch (error) {
          DEBUG.warn(MODULE, 'Block handle posAtDOM failed', { error });
          logWarning('Block handle posAtDOM failed', { error: String(error) });
        }
        if (resolvedPos !== null) {
          container.dataset.blockPos = String(resolvedPos);
        }
        return resolvedPos;
      };

      const posValue = resolvePosFromContainer();
      if (posValue === null || !Number.isFinite(posValue)) {
        DEBUG.warn(MODULE, 'Block handle pos missing', { dataset: { ...container.dataset } });
        logWarning('Block handle pos missing', { dataset: { ...container.dataset } });
        return null;
      }
      const node = editor.state.doc.nodeAt(posValue);
      if (!node || node.isText) {
        DEBUG.warn(MODULE, 'Block handle node missing', { pos: posValue, type: node?.type?.name ?? 'unknown' });
        logWarning('Block handle node missing', { pos: posValue, type: node?.type?.name ?? 'unknown' });
        return null;
      }
      return { node, pos: posValue };
    };

    const setActiveBlockFromHandleTarget = (target: HTMLElement | null) => {
      const block = resolveBlockFromHandleTarget(target);
      if (block) {
        storage.setActiveNode(block.node, block.pos);
      }
      return block;
    };

    const resolveIndentFromSelection = (): number => {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth >= 1; depth -= 1) {
        const node = $from.node(depth);
        if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, 'indent')) {
          return normalizeIndentAttr(node.attrs.indent);
        }
      }
      return 0;
    };

    const resolveIndentFromBlock = (block: { node: ProseMirrorNode; pos: number } | null): number => {
      if (block?.node?.attrs && Object.prototype.hasOwnProperty.call(block.node.attrs, 'indent')) {
        return normalizeIndentAttr(block.node.attrs.indent);
      }
      return resolveIndentFromSelection();
    };

    const createNestedPageAt = async (pos: number, indent: number, reason: 'slash' | 'menu') => {
      const createNestedPage = this.options.createNestedPage;
      const openNestedPage = this.options.openNestedPage;
      const nestedPageI18n = t().nestedPage;
      if (!createNestedPage) {
        DEBUG.error(MODULE, 'Nested page create handler missing');
        notifyHostError('NESTED_PAGE_CREATE_UNAVAILABLE', 'ネストページの作成ハンドラが未設定です。', {
          pos,
          indent,
          reason,
        });
        return;
      }

      const startedAt = Date.now();
      DEBUG.log(MODULE, 'Nested page create requested', {
        pos,
        indent,
        reason,
        title: nestedPageI18n.defaultTitle,
      });

      try {
        const result = await createNestedPage(nestedPageI18n.defaultTitle);
        if (!result?.path) {
          throw new Error('nestedPage path missing');
        }
        const safePos = Math.min(Math.max(0, pos), editor.state.doc.content.size);
        editor
          .chain()
          .focus()
          .insertContentAt(safePos, {
            type: 'nestedPage',
            attrs: { title: result.title, path: result.path, indent },
          })
          .setNodeSelection(safePos)
          .run();
        DEBUG.log(MODULE, 'Nested page inserted', {
          path: result.path,
          title: result.title,
          durationMs: Date.now() - startedAt,
        });

        const triggerOpen = () => {
          if (!openNestedPage) {
            DEBUG.error(MODULE, 'Nested page open handler missing');
            notifyHostError('NESTED_PAGE_OPEN_UNAVAILABLE', 'ネストページを開くハンドラが未設定です。', {
              path: result.path,
              reason,
            });
            return;
          }
          try {
            openNestedPage(result.path);
            DEBUG.log(MODULE, 'Nested page open triggered', { path: result.path, reason });
          } catch (error) {
            DEBUG.error(MODULE, 'Nested page open failed', { error, path: result.path, reason });
            notifyHostError('NESTED_PAGE_OPEN_FAILED', 'ネストページのオープンに失敗しました。', {
              error: String(error),
              path: result.path,
              reason,
            });
          }
        };

        requestAnimationFrame(() => {
          triggerOpen();
        });
      } catch (error) {
        DEBUG.error(MODULE, 'Nested page create failed', { error });
        notifyHostError('NESTED_PAGE_CREATE_FAILED', 'ネストページの作成に失敗しました。', {
          error: String(error),
          durationMs: Date.now() - startedAt,
          reason,
        });
      }
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
      logInfo('Drag handle lock updated', { locked: isDragHandleLocked, reason: shouldLock ? 'menu-active' : 'menu-hidden' });
    };

    const hideContextMenu = () => {
      if (contextMenu) {
        contextMenu.classList.remove('is-visible');
        storage.selectedContextIndex = -1;
        storage.contextItemCount = 0;
        contextMenuTargetPos = null;
        closeMenu('blockContext', { skipHide: true });
        syncDragHandleLock();
      }
    };

    const hideBlockTypeMenu = () => {
      if (blockTypeMenu) {
        blockTypeMenu.classList.remove('is-visible');
        storage.selectedMenuIndex = -1;
        storage.menuItemCount = 0;
        blockTypeMenuTargetPos = null;
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
        { icon: 'Pg', label: fm.nestedPage, blockType: 'nestedPage', keywords: ['page', 'nested', 'subpage', 'md', 'ページ', 'ネスト'] },
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

    const createMenuItem = (label: string, action: string, icon?: string, iconText?: string): HTMLElement => {
      return createBlockMenuItem({
        label,
        action,
        icon,
        iconText,
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

    const collectContentJson = (node: ProseMirrorNode): unknown[] => {
      const items: unknown[] = [];
      node.content.forEach((child) => {
        items.push(child.toJSON());
      });
      return items;
    };

    const serializeNodeToMarkdown = (node: ProseMirrorNode, context: Record<string, unknown>): string | null => {
      const docJson = { type: 'doc', content: [node.toJSON()] };
      return serializeMarkdown(editor, docJson, context);
    };

    const serializeListItemContentToMarkdown = (node: ProseMirrorNode): string | null => {
      const content = collectContentJson(node);
      const docJson = { type: 'doc', content };
      return serializeMarkdown(editor, docJson, { blockType: node.type.name, mode: 'listItemContent' });
    };

    const serializeBlockForClipboard = (block: { node: ProseMirrorNode; pos: number }): string | null => {
      const { node, pos } = block;
      if (node.type.name === 'listItem') {
        const resolved = editor.state.doc.resolve(pos);
        for (let depth = resolved.depth; depth >= 0; depth -= 1) {
          const parent = resolved.node(depth);
          if (parent.type.name === 'bulletList' || parent.type.name === 'orderedList') {
            const listJson = {
              type: parent.type.name,
              attrs: parent.attrs ?? {},
              content: [node.toJSON()],
            };
            const docJson = { type: 'doc', content: [listJson] };
            return serializeMarkdown(editor, docJson, { blockType: node.type.name, mode: 'clipboard' });
          }
        }
        return serializeListItemContentToMarkdown(node);
      }
      return serializeNodeToMarkdown(node, { blockType: node.type.name, mode: 'clipboard' });
    };

    const convertListItemToPlainText = (block: { node: ProseMirrorNode; pos: number }) => {
      const { node, pos } = block;
      const markdown = serializeListItemContentToMarkdown(node);
      if (markdown === null) {
        return;
      }
      const content = markdown.trimEnd();
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from, to },
          {
            type: 'plainTextBlock',
            content: content ? [{ type: 'text', text: content }] : [],
          }
        )
        .setTextSelection(from + 1)
        .run();
      DEBUG.log(MODULE, 'Converted listItem to plain text', { pos });
    };

    const convertBlockToPlainText = (block: { node: ProseMirrorNode; pos: number }) => {
      const { node, pos } = block;
      if (node.type.name === 'rawBlock' || node.type.name === 'plainTextBlock') {
        notifyHostError('PLAIN_TEXT_EDIT_UNSUPPORTED', 'RAW ブロックはプレーン編集できません。', {
          blockType: node.type.name,
        });
        return;
      }
      if (node.type.name === 'listItem') {
        convertListItemToPlainText(block);
        return;
      }
      const markdown = serializeNodeToMarkdown(node, { blockType: node.type.name });
      if (markdown === null) {
        return;
      }
      const content = markdown.trimEnd();
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: pos, to: pos + node.nodeSize },
          {
            type: 'plainTextBlock',
            content: content ? [{ type: 'text', text: content }] : [],
          }
        )
        .setTextSelection(pos + 1)
        .run();
      DEBUG.log(MODULE, 'Converted block to plain text', { pos, type: node.type.name });
    };

    const handleContextMenuAction = async (action: string, block: { node: ProseMirrorNode; pos: number }) => {
      if (action === 'indentListItem') {
        editor.chain().focus().setNodeSelection(block.pos).run();
        executeCommand(editor, 'indentListItem');
      } else if (action === 'outdentListItem') {
        editor.chain().focus().setNodeSelection(block.pos).run();
        executeCommand(editor, 'outdentListItem');
      } else if (action === 'indentBlock') {
        editor.chain().focus().setNodeSelection(block.pos).run();
        executeCommand(editor, 'indentBlock');
      } else if (action === 'outdentBlock') {
        editor.chain().focus().setNodeSelection(block.pos).run();
        executeCommand(editor, 'outdentBlock');
      } else if (action === 'delete') {
        deleteBlock(block);
      } else if (action === 'copy') {
        const text = serializeBlockForClipboard(block);
        if (text === null) {
          logWarning('Copy skipped: markdown serialize failed', { type: block.node.type.name, pos: block.pos });
          hideContextMenu();
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          DEBUG.log(MODULE, 'Copied to clipboard', { length: text.length });
          logSuccess('Copied markdown to clipboard', { type: block.node.type.name, pos: block.pos, length: text.length });
        } catch (err) {
          DEBUG.error(MODULE, 'Failed to copy', err);
          logWarning('Failed to copy markdown to clipboard', { error: String(err) });
        }
      } else if (action === 'plainText') {
        convertBlockToPlainText(block);
      }
      hideContextMenu();
    };

    const showContextMenu = (x: number, y: number, block: { node: ProseMirrorNode; pos: number }) => {
      if (!contextMenu) return;

      DEBUG.log(MODULE, 'Showing context menu', { type: block.node.type.name, pos: block.pos });
      contextMenu.innerHTML = '';

      const bh = t().blockHandles;
      const contextItems: Array<{ label: string; action: string; icon?: string; iconText?: string }> = [];
      if (block.node.type.name === 'listItem') {
        contextItems.push({ label: bh.indent, action: 'indentListItem', iconText: '>' });
        contextItems.push({ label: bh.outdent, action: 'outdentListItem', iconText: '<' });
      } else if (block.node.type.name !== 'table') {
        contextItems.push({ label: bh.indent, action: 'indentBlock', iconText: '>' });
        contextItems.push({ label: bh.outdent, action: 'outdentBlock', iconText: '<' });
      }
      if (
        block.node.type.name !== 'rawBlock' &&
        block.node.type.name !== 'plainTextBlock' &&
        !block.node.type.spec.tableRole
      ) {
        contextItems.push({ label: bh.plainText, action: 'plainText', icon: icons.fileText });
      }
      contextItems.push({ label: bh.delete, action: 'delete', icon: icons.trash });
      contextItems.push({ label: bh.copy, action: 'copy', icon: icons.copy });

      contextItems.forEach((item) => {
        contextMenu.appendChild(createMenuItem(item.label, item.action, item.icon, item.iconText));
      });

      storage.contextItemCount = contextItems.length;
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
      contextMenuTargetPos = block.pos;

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

          const onBlockTypeMenuClick = async (e: MouseEvent) => {
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
              const indent = resolveIndentFromSelection();
              const insertPos = editor.state.selection.from;

              switch (blockType) {
                case 'heading1':
                  editor.chain().focus().setHeading({ level: 1, indent }).run();
                  break;
                case 'heading2':
                  editor.chain().focus().setHeading({ level: 2, indent }).run();
                  break;
                case 'heading3':
                  editor.chain().focus().setHeading({ level: 3, indent }).run();
                  break;
                case 'bulletList':
                  editor.chain().focus().toggleBulletList().updateAttributes('bulletList', { indent }).run();
                  break;
                case 'orderedList':
                  editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { indent }).run();
                  break;
                case 'codeBlock':
                  editor.chain().focus().setCodeBlock({ indent }).run();
                  break;
                case 'blockquote':
                  editor.chain().focus().setBlockquote({ indent }).run();
                  break;
                case 'table':
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  break;
                case 'nestedPage':
                  await createNestedPageAt(insertPos, indent, 'slash');
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
              const indent = resolveIndentFromBlock(active);

              switch (blockType) {
                case 'heading1':
                  editor.chain().focus().insertContentAt(pos, { type: 'heading', attrs: { level: 1, indent } }).setTextSelection(pos + 1).run();
                  break;
                case 'heading2':
                  editor.chain().focus().insertContentAt(pos, { type: 'heading', attrs: { level: 2, indent } }).setTextSelection(pos + 1).run();
                  break;
                case 'heading3':
                  editor.chain().focus().insertContentAt(pos, { type: 'heading', attrs: { level: 3, indent } }).setTextSelection(pos + 1).run();
                  break;
                case 'bulletList':
                  editor.chain().focus().insertContentAt(pos, { type: 'bulletList', attrs: { indent }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }).setTextSelection(pos + 3).run();
                  break;
                case 'orderedList':
                  editor.chain().focus().insertContentAt(pos, { type: 'orderedList', attrs: { indent }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }).setTextSelection(pos + 3).run();
                  break;
                case 'codeBlock':
                  editor.chain().focus().insertContentAt(pos, { type: 'codeBlock', attrs: { indent } }).setTextSelection(pos + 1).run();
                  break;
                case 'blockquote':
                  editor.chain().focus().insertContentAt(pos, { type: 'blockquote', attrs: { indent }, content: [{ type: 'paragraph' }] }).setTextSelection(pos + 2).run();
                  break;
                case 'table':
                  editor.chain().focus().setTextSelection(pos).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  break;
                case 'nestedPage':
                  await createNestedPageAt(pos, indent, 'menu');
                  break;
                default:
                  editor.chain().focus().insertContentAt(pos, { type: 'paragraph', attrs: { indent } }).setTextSelection(pos + 1).run();
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

          const openBlockTypeMenuFromButton = (addBtn: HTMLElement) => {
            storage.slashCommandRange = null;
            const active = setActiveBlockFromHandleTarget(addBtn);
            if (!active) {
              DEBUG.warn(MODULE, 'Add button click ignored: no active block');
              return;
            }
            if (isMenuActive('blockType') && blockTypeMenuTargetPos === active.pos) {
              hideBlockTypeMenu();
              return;
            }
            blockTypeMenuTargetPos = active.pos;
            const btnRect = addBtn.getBoundingClientRect();
            showBlockTypeMenu(btnRect.left, btnRect.bottom + 4);
          };

          const openContextMenuFromHandle = (handleBtn: HTMLElement, event: PointerEvent) => {
            const active = setActiveBlockFromHandleTarget(handleBtn);
            if (!active) {
              DEBUG.warn(MODULE, 'Handle click ignored: no active block');
              return;
            }
            if (isMenuActive('blockContext') && contextMenuTargetPos === active.pos) {
              hideContextMenu();
              return;
            }
            editor.chain().focus().setNodeSelection(active.pos).run();
            showContextMenu(event.clientX, event.clientY, active);
          };

          const resolvePointerAction = (target: HTMLElement) => {
            const addBtn = target.closest('.block-add-btn') as HTMLElement | null;
            if (addBtn) {
              return { kind: 'add' as const, element: addBtn };
            }
            const handleBtn = target.closest('.block-handle') as HTMLElement | null;
            if (handleBtn) {
              return { kind: 'handle' as const, element: handleBtn };
            }
            return null;
          };

          const clearPendingPointerAction = () => {
            pendingPointerAction = null;
          };

          const onHandlePointerDown = (e: PointerEvent) => {
            if (!e.isPrimary) return;
            if (typeof e.button === 'number' && e.button !== 0) return;
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const action = resolvePointerAction(target);
            if (!action) return;
            pendingPointerAction = {
              kind: action.kind,
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              element: action.element,
            };
          };

          const onHandlePointerMove = (e: PointerEvent) => {
            if (!pendingPointerAction || pendingPointerAction.pointerId !== e.pointerId) {
              return;
            }
            const dx = e.clientX - pendingPointerAction.startX;
            const dy = e.clientY - pendingPointerAction.startY;
            const distance = Math.hypot(dx, dy);
            if (distance >= HANDLE_CLICK_THRESHOLD_PX) {
              clearPendingPointerAction();
            }
          };

          const onHandlePointerUp = (e: PointerEvent) => {
            if (!pendingPointerAction || pendingPointerAction.pointerId !== e.pointerId) {
              return;
            }
            const action = pendingPointerAction;
            clearPendingPointerAction();
            const dx = e.clientX - action.startX;
            const dy = e.clientY - action.startY;
            const distance = Math.hypot(dx, dy);
            if (distance >= HANDLE_CLICK_THRESHOLD_PX) {
              return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (action.kind === 'add') {
              openBlockTypeMenuFromButton(action.element);
            } else {
              openContextMenuFromHandle(action.element, e);
            }

            suppressNextDocumentClick = true;
            setTimeout(() => {
              suppressNextDocumentClick = false;
            }, 0);
          };

          const onHandlePointerCancel = (e: PointerEvent) => {
            if (!pendingPointerAction || pendingPointerAction.pointerId !== e.pointerId) {
              return;
            }
            clearPendingPointerAction();
          };

          const onHandleDragStart = (e: DragEvent) => {
            if (!pendingPointerAction) {
              return;
            }
            const target = e.target as HTMLElement | null;
            if (!target) {
              return;
            }
            if (target.closest('.block-handle')) {
              clearPendingPointerAction();
            }
          };

          const onDocumentClick = (e: MouseEvent) => {
            if (suppressNextDocumentClick) {
              suppressNextDocumentClick = false;
              return;
            }
            const target = e.target as HTMLElement;
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
          document.addEventListener('pointerdown', onHandlePointerDown, true);
          document.addEventListener('pointermove', onHandlePointerMove, true);
          document.addEventListener('pointerup', onHandlePointerUp, true);
          document.addEventListener('pointercancel', onHandlePointerCancel, true);
          document.addEventListener('dragstart', onHandleDragStart, true);

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
              document.removeEventListener('pointerdown', onHandlePointerDown, true);
              document.removeEventListener('pointermove', onHandlePointerMove, true);
              document.removeEventListener('pointerup', onHandlePointerUp, true);
              document.removeEventListener('pointercancel', onHandlePointerCancel, true);
              document.removeEventListener('dragstart', onHandleDragStart, true);
              pendingPointerAction = null;
              contextMenu?.remove();
              blockTypeMenu?.remove();
            },
          };
        },
      }),
    ];
  },
});
