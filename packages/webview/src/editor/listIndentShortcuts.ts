/**
 * List indent shortcuts (Tab / Shift-Tab)
 *
 * 役割: Webview内でTab/Shift-Tabを捕捉し、リストのインデント操作を実行する。
 * 不変条件: listItem以外では何もしない（VS Code側のキーバインドに依存しない）。
 */

import { Extension } from '@tiptap/core';
import { executeCommand } from './commands.js';

export const ListIndentShortcuts = Extension.create({
  name: 'listIndentShortcuts',

  addKeyboardShortcuts() {
    return {
      Tab: () => executeCommand(this.editor, 'indentListItem'),
      'Shift-Tab': () => executeCommand(this.editor, 'outdentListItem'),
    };
  },
});
