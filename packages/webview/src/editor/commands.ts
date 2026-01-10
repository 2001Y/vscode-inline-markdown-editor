/**
 * Editor Commands Map
 *
 * VSCode keybindings -> postMessage -> このマップでTiptapコマンド実行
 *
 * Tiptapのビルトインショートカットを無効化し、
 * VSCodeのkeybindingsで全て管理することで、ユーザーがカスタマイズ可能にする
 */

import type { Editor } from '@tiptap/core';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { NodeSelection, Selection } from '@tiptap/pm/state';

export type CommandName =
  // Marks (テキスト装飾)
  | 'toggleBold'
  | 'toggleItalic'
  | 'toggleStrike'
  | 'toggleCode'
  | 'toggleUnderline'
  // Nodes (ブロック)
  | 'toggleHeading1'
  | 'toggleHeading2'
  | 'toggleHeading3'
  | 'toggleHeading4'
  | 'toggleHeading5'
  | 'toggleHeading6'
  | 'toggleBulletList'
  | 'toggleOrderedList'
  | 'toggleBlockquote'
  | 'toggleCodeBlock'
  | 'indentListItem'
  | 'outdentListItem'
  | 'setHorizontalRule'
  // History
  | 'undo'
  | 'redo';

/**
 * コマンド名からTiptapコマンドを実行するマップ
 */
export function executeCommand(editor: Editor, command: CommandName): boolean {
  const isSelectionInListItem = (): boolean => {
    if (editor.isActive('listItem') || editor.isActive('bulletList') || editor.isActive('orderedList')) {
      return true;
    }
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      if ($from.node(depth).type.name === 'listItem') {
        return true;
      }
    }
    const selection = editor.state.selection;
    if (selection instanceof NodeSelection && selection.node.type.name === 'listItem') {
      return true;
    }
    const before = $from.nodeBefore;
    const after = $from.nodeAfter;
    if (before?.type.name === 'listItem' || after?.type.name === 'listItem') {
      return true;
    }
    return false;
  };

  const ensureListItemSelection = (): void => {
    const selection = editor.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'listItem') {
      return;
    }
    const insidePos = selection.from + 1;
    const $inside = editor.state.doc.resolve(insidePos);
    const nextSelection = Selection.findFrom($inside, 1, true) ?? Selection.near($inside, 1);
    if (nextSelection) {
      editor.view.dispatch(editor.state.tr.setSelection(nextSelection));
    }
  };

  const commands: Record<CommandName, () => boolean> = {
    // Marks
    toggleBold: () => editor.chain().focus().toggleBold().run(),
    toggleItalic: () => editor.chain().focus().toggleItalic().run(),
    toggleStrike: () => editor.chain().focus().toggleStrike().run(),
    toggleCode: () => editor.chain().focus().toggleCode().run(),
    toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),

    // Headings
    toggleHeading1: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    toggleHeading2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    toggleHeading3: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    toggleHeading4: () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    toggleHeading5: () => editor.chain().focus().toggleHeading({ level: 5 }).run(),
    toggleHeading6: () => editor.chain().focus().toggleHeading({ level: 6 }).run(),

    // Lists & Blocks
    toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
    toggleBlockquote: () => editor.chain().focus().toggleBlockquote().run(),
    toggleCodeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
    indentListItem: () => {
      const timestamp = new Date().toISOString();
      if (!isSelectionInListItem()) {
        console.warn(`[WARNING][Commands] ${timestamp} List indent ignored: not in listItem`);
        return false;
      }
      const listItem = editor.state.schema.nodes.listItem;
      if (!listItem) {
        console.error(`[ERROR][Commands] ${timestamp} listItem node not found`);
        return false;
      }
      ensureListItemSelection();
      const ok = sinkListItem(listItem)(editor.state, editor.view.dispatch, editor.view);
      if (ok) {
        console.log(`[SUCCESS][Commands] ${timestamp} List indent applied`, {
          selectionFrom: editor.state.selection.from,
        });
      } else {
        console.warn(`[WARNING][Commands] ${timestamp} List indent blocked`, {
          selectionFrom: editor.state.selection.from,
        });
      }
      return ok;
    },
    outdentListItem: () => {
      const timestamp = new Date().toISOString();
      if (!isSelectionInListItem()) {
        console.warn(`[WARNING][Commands] ${timestamp} List outdent ignored: not in listItem`);
        return false;
      }
      const listItem = editor.state.schema.nodes.listItem;
      if (!listItem) {
        console.error(`[ERROR][Commands] ${timestamp} listItem node not found`);
        return false;
      }
      ensureListItemSelection();
      const ok = liftListItem(listItem)(editor.state, editor.view.dispatch, editor.view);
      if (ok) {
        console.log(`[SUCCESS][Commands] ${timestamp} List outdent applied`, {
          selectionFrom: editor.state.selection.from,
        });
      } else {
        console.warn(`[WARNING][Commands] ${timestamp} List outdent blocked`, {
          selectionFrom: editor.state.selection.from,
        });
      }
      return ok;
    },
    setHorizontalRule: () => editor.chain().focus().setHorizontalRule().run(),

    // History
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
  };

  const fn = commands[command];
  if (fn) {
    return fn();
  }
  console.warn(`[Commands] Unknown command: ${command}`);
  return false;
}

/**
 * VSCodeのデフォルトキーバインド定義
 * package.json の contributes.keybindings 生成用
 */
export const DEFAULT_KEYBINDINGS: Array<{
  command: CommandName;
  key: string;      // Windows/Linux
  mac: string;      // macOS
  title: string;    // コマンドパレット表示名
  titleJa: string;  // 日本語
}> = [
  // Marks
  { command: 'toggleBold', key: 'ctrl+b', mac: 'cmd+b', title: 'Toggle Bold', titleJa: '太字の切り替え' },
  { command: 'toggleItalic', key: 'ctrl+i', mac: 'cmd+i', title: 'Toggle Italic', titleJa: '斜体の切り替え' },
  { command: 'toggleStrike', key: 'ctrl+shift+s', mac: 'cmd+shift+s', title: 'Toggle Strikethrough', titleJa: '取り消し線の切り替え' },
  { command: 'toggleCode', key: 'ctrl+e', mac: 'cmd+e', title: 'Toggle Code', titleJa: 'コードの切り替え' },
  { command: 'toggleUnderline', key: 'ctrl+u', mac: 'cmd+u', title: 'Toggle Underline', titleJa: '下線の切り替え' },

  // Headings
  { command: 'toggleHeading1', key: 'ctrl+alt+1', mac: 'cmd+alt+1', title: 'Toggle Heading 1', titleJa: '見出し1の切り替え' },
  { command: 'toggleHeading2', key: 'ctrl+alt+2', mac: 'cmd+alt+2', title: 'Toggle Heading 2', titleJa: '見出し2の切り替え' },
  { command: 'toggleHeading3', key: 'ctrl+alt+3', mac: 'cmd+alt+3', title: 'Toggle Heading 3', titleJa: '見出し3の切り替え' },
  { command: 'toggleHeading4', key: 'ctrl+alt+4', mac: 'cmd+alt+4', title: 'Toggle Heading 4', titleJa: '見出し4の切り替え' },
  { command: 'toggleHeading5', key: 'ctrl+alt+5', mac: 'cmd+alt+5', title: 'Toggle Heading 5', titleJa: '見出し5の切り替え' },
  { command: 'toggleHeading6', key: 'ctrl+alt+6', mac: 'cmd+alt+6', title: 'Toggle Heading 6', titleJa: '見出し6の切り替え' },

  // Lists & Blocks
  { command: 'toggleBulletList', key: 'ctrl+shift+8', mac: 'cmd+shift+8', title: 'Toggle Bullet List', titleJa: '箇条書きの切り替え' },
  { command: 'toggleOrderedList', key: 'ctrl+shift+7', mac: 'cmd+shift+7', title: 'Toggle Ordered List', titleJa: '番号付きリストの切り替え' },
  { command: 'toggleBlockquote', key: 'ctrl+shift+b', mac: 'cmd+shift+b', title: 'Toggle Blockquote', titleJa: '引用の切り替え' },
  { command: 'toggleCodeBlock', key: 'ctrl+alt+c', mac: 'cmd+alt+c', title: 'Toggle Code Block', titleJa: 'コードブロックの切り替え' },
  { command: 'setHorizontalRule', key: 'ctrl+alt+h', mac: 'cmd+alt+h', title: 'Insert Horizontal Rule', titleJa: '水平線の挿入' },
  { command: 'indentListItem', key: 'tab', mac: 'tab', title: 'Indent List Item', titleJa: 'リストのインデント' },
  { command: 'outdentListItem', key: 'shift+tab', mac: 'shift+tab', title: 'Outdent List Item', titleJa: 'リストのインデント解除' },

  // History (VSCodeと同じキーを使用)
  { command: 'undo', key: 'ctrl+z', mac: 'cmd+z', title: 'Undo', titleJa: '元に戻す' },
  { command: 'redo', key: 'ctrl+shift+z', mac: 'cmd+shift+z', title: 'Redo', titleJa: 'やり直し' },
];
