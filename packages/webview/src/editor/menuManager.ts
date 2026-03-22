/**
 * Centralized menu visibility coordinator for block/table menus.
 * Ensures only one menu is visible at a time and syncs context key to VS Code.
 */

import { createMenuStateChangeMessage } from '../protocol/types.js';
import { postToVsCode } from '../protocol/vscodeApi.js';
import { createLogger } from '../logger.js';

type MenuId = 'blockType' | 'blockContext' | 'tableContext';

type MenuHideHandler = () => void;

const menuRegistry = new Map<MenuId, MenuHideHandler>();
let activeMenu: MenuId | null = null;
const log = createLogger('MenuManager');

const setActiveMenu = (next: MenuId | null): void => {
  if (activeMenu === next) {return;}
  activeMenu = next;
  const delivered = postToVsCode(createMenuStateChangeMessage(activeMenu !== null));
  if (!delivered) {
    log.warn('VS Code postMessage bridge not available (menuStateChange not sent)');
  }
};

const closeMenusExcept = (id: MenuId): void => {
  const entries = Array.from(menuRegistry.entries());
  for (const [menuId, hide] of entries) {
    if (menuId !== id) {
      hide();
    }
  }
};

export const registerMenu = (id: MenuId, hide: MenuHideHandler): void => {
  menuRegistry.set(id, hide);
};

export const openMenu = (id: MenuId): void => {
  if (!menuRegistry.has(id)) {
    log.warn(`Menu "${id}" is not registered`);
    return;
  }
  closeMenusExcept(id);
  setActiveMenu(id);
};

export const closeMenu = (id: MenuId, options?: { skipHide?: boolean }): void => {
  if (activeMenu !== id) {
    return;
  }
  setActiveMenu(null);
  if (!options?.skipHide) {
    const hide = menuRegistry.get(id);
    if (hide) {
      hide();
    }
  }
};

export const closeAllMenus = (): void => {
  const handlers = Array.from(menuRegistry.values());
  try {
    for (const hide of handlers) {
      hide();
    }
  } finally {
    setActiveMenu(null);
  }
};

export const isMenuActive = (id?: MenuId): boolean => {
  if (id) {return activeMenu === id;}
  return activeMenu !== null;
};
