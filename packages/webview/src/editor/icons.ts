/**
 * Codicon mapping for inlineMark UI
 * - Use VS Code Codicon font for all UI icons.
 */

export type IconName =
  | 'trash'
  | 'copy'
  | 'gripVertical'
  | 'gripHorizontal'
  | 'plus'
  | 'listUnordered'
  | 'listOrdered'
  | 'code'
  | 'openPreview'
  | 'quote'
  | 'table'
  | 'info'
  | 'fileText'
  | 'fileSubmodule'
  | 'chevronUp'
  | 'chevronDown'
  | 'chevronRight'
  | 'close'
  | 'caseSensitive'
  | 'wholeWord'
  | 'regex'
  | 'selection'
  | 'preserveCase'
  | 'replace'
  | 'replaceAll'
  | 'arrowUp'
  | 'arrowDown';

export const icons: Record<IconName, string> = {
  trash: 'codicon codicon-trash',
  copy: 'codicon codicon-copy',
  gripVertical: 'codicon codicon-gripper',
  gripHorizontal: 'codicon codicon-gripper',
  plus: 'codicon codicon-add',
  listUnordered: 'codicon codicon-list-unordered',
  listOrdered: 'codicon codicon-list-ordered',
  code: 'codicon codicon-code',
  openPreview: 'codicon codicon-open-preview',
  quote: 'codicon codicon-quote',
  table: 'codicon codicon-table',
  info: 'codicon codicon-info',
  fileText: 'codicon codicon-file-text',
  fileSubmodule: 'codicon codicon-file-submodule',
  chevronUp: 'codicon codicon-chevron-up',
  chevronDown: 'codicon codicon-chevron-down',
  chevronRight: 'codicon codicon-chevron-right',
  close: 'codicon codicon-close',
  caseSensitive: 'codicon codicon-case-sensitive',
  wholeWord: 'codicon codicon-whole-word',
  regex: 'codicon codicon-regex',
  selection: 'codicon codicon-selection',
  preserveCase: 'codicon codicon-preserve-case',
  replace: 'codicon codicon-replace',
  replaceAll: 'codicon codicon-replace-all',
  arrowUp: 'codicon codicon-arrow-up',
  arrowDown: 'codicon codicon-arrow-down',
};

export const createIconElement = (icon: IconName, extraClass?: string): HTMLElement => {
  const span = document.createElement('span');
  span.className = icons[icon];
  if (extraClass) {
    span.classList.add(extraClass);
  }
  return span;
};
