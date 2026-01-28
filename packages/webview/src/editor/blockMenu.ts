/**
 * Block Menu Component (shared)
 * - block-type-menu / block-context-menu を統一する汎用メニュー
 * - キーボード操作・選択状態の更新を共通化
 */

import DOMPurify from 'dompurify';

export type BlockMenuType = 'blockType' | 'blockContext' | 'tableContext';

export interface BlockMenuPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SVG_ICON_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true },
  FORBID_TAGS: ['script', 'foreignObject'],
};

const stripUnsafeSvgAttributes = (root: Element): void => {
  root.querySelectorAll('script, foreignObject').forEach((el) => el.remove());
  const nodes = [root, ...root.querySelectorAll('*')];
  nodes.forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const isUnsafeUrl = value.startsWith('javascript:') || value.startsWith('data:');
      if (name.startsWith('on') || value.includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
      if ((name === 'href' || name === 'xlink:href') && isUnsafeUrl) {
        el.removeAttribute(attr.name);
      }
    });
  });
};

export const createBlockMenu = (type: BlockMenuType): HTMLElement => {
  const menu = document.createElement('div');
  menu.className = 'block-menu';
  menu.dataset.menuType = type;
  menu.setAttribute('role', 'menu');
  return menu;
};

export const createBlockMenuItem = (options: {
  label: string;
  icon?: string;
  iconText?: string;
  action?: string;
  blockType?: string;
}): HTMLElement => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'block-menu-item';
  item.setAttribute('role', 'menuitem');

  if (options.action) {
    item.dataset.action = options.action;
  }
  if (options.blockType) {
    item.dataset.blockType = options.blockType;
  }

  if (options.icon || options.iconText) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'block-menu-icon';
    if (options.icon) {
      const sanitized = DOMPurify.sanitize(options.icon, SVG_ICON_SANITIZE_CONFIG);
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(sanitized, 'image/svg+xml');
      const parserError = svgDoc.querySelector('parsererror');
      if (parserError) {
        console.error('[BlockMenu] Invalid SVG icon:', parserError.textContent);
      } else {
        const svgElement = svgDoc.documentElement;
        if (svgElement && svgElement.tagName.toLowerCase() === 'svg') {
          stripUnsafeSvgAttributes(svgElement);
          iconSpan.appendChild(document.importNode(svgElement, true));
        } else {
          console.error('[BlockMenu] Invalid SVG icon: missing <svg> root');
        }
      }
    } else if (options.iconText) {
      iconSpan.textContent = options.iconText;
    }
    item.appendChild(iconSpan);
  }

  const labelSpan = document.createElement('span');
  labelSpan.textContent = options.label;
  item.appendChild(labelSpan);

  return item;
};

export const createBlockMenuSeparator = (): HTMLElement => {
  const sep = document.createElement('div');
  sep.className = 'block-menu-separator';
  return sep;
};

export const getBlockMenuItems = (menu: HTMLElement | null): HTMLElement[] => {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll('.block-menu-item')) as HTMLElement[];
};

export const updateBlockMenuSelection = (menu: HTMLElement | null, selectedIndex: number): void => {
  if (!menu) return;
  const items = getBlockMenuItems(menu);
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('is-selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('is-selected');
    }
  });
};

export const positionBlockMenu = (menu: HTMLElement, position: BlockMenuPosition): void => {
  menu.style.setProperty('--menu-x', `${position.x}px`);
  menu.style.setProperty('--menu-y', `${position.y}px`);
  menu.style.setProperty('--menu-w', `${position.width}px`);
  menu.style.setProperty('--menu-h', `${position.height}px`);
};
