/**
 * List + Block indent shortcuts (Tab / Shift-Tab)
 *
 * 役割: Webview内でTab/Shift-Tabを捕捉し、リスト or ブロックのインデント操作を実行する。
 * 不変条件: listItemはリスト専用、その他はブロックインデントに委譲する。
 */

import { Extension } from '@tiptap/core';
import { executeCommand } from './commands.js';

export const ListIndentShortcuts = Extension.create({
  name: 'listIndentShortcuts',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('listItem')) {
          executeCommand(this.editor, 'indentListItem');
          return true;
        }
        executeCommand(this.editor, 'indentBlock');
        return true;
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem')) {
          executeCommand(this.editor, 'outdentListItem');
          return true;
        }
        executeCommand(this.editor, 'outdentBlock');
        return true;
      },
    };
  },
});
