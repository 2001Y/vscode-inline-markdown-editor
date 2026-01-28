/**
 * Editor Commands Map
 *
 * VSCode keybindings -> postMessage -> このマップでTiptapコマンド実行
 *
 * Tiptapのビルトインショートカットを無効化し、
 * VSCodeのkeybindingsで全て管理することで、ユーザーがカスタマイズ可能にする
 */

import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { INDENT_LEVEL_MAX, INDENT_MAX_DEPTH_MESSAGE, normalizeIndentAttr } from './indentConfig.js';
import { DEBUG } from './debug.js';
import { notifyHostWarn } from './hostNotifier.js';
import { LIST_MAX_DEPTH } from './listIndentConfig.js';

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
  | 'indentBlock'
  | 'outdentBlock'
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
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      if ($from.node(depth).type.name === 'listItem') {
        return true;
      }
    }
    return false;
  };

  const findNearestListItemPos = (pos: number): number | null => {
    const $pos = editor.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      if ($pos.node(depth).type.name === 'listItem') {
        return $pos.before(depth);
      }
    }
    return null;
  };

  const getListItemDepthAtPos = (pos: number): number => {
    const $pos = editor.state.doc.resolve(pos);
    let depth = 0;
    for (let d = $pos.depth; d >= 0; d -= 1) {
      if ($pos.node(d).type.name === 'listItem') {
        depth += 1;
      }
    }
    return depth;
  };

  const resolveListItemPosFromSelection = (): number | null => {
    const selection = editor.state.selection;
    if (selection instanceof NodeSelection && selection.node.type.name === 'listItem') {
      return selection.from;
    }
    const byDepth = findNearestListItemPos(selection.from);
    if (byDepth !== null) {
      return byDepth;
    }
    const { $from } = selection;
    if ($from.nodeBefore?.type.name === 'listItem') {
      return $from.pos - $from.nodeBefore.nodeSize;
    }
    if ($from.nodeAfter?.type.name === 'listItem') {
      return $from.pos;
    }
    return null;
  };

  const ensureListItemSelection = (listItemPos: number): boolean => {
    const listItemNode = editor.state.doc.nodeAt(listItemPos);
    if (!listItemNode) {
      return false;
    }

    const selection = editor.state.selection;
    if (
      !(selection instanceof NodeSelection) &&
      selection.from > listItemPos &&
      selection.to < listItemPos + listItemNode.nodeSize
    ) {
      return true;
    }

    const $inside = editor.state.doc.resolve(listItemPos + 1);
    const nextSelection = Selection.findFrom($inside, 1, true) ?? Selection.near($inside, 1);
    if (!nextSelection) {
      return false;
    }
    if (nextSelection.from <= listItemPos || nextSelection.to >= listItemPos + listItemNode.nodeSize) {
      return false;
    }
    editor.view.dispatch(editor.state.tr.setSelection(nextSelection));
    return true;
  };

  const isIndentableNode = (node: ProseMirrorNode | null | undefined): boolean => {
    if (!node?.isBlock) return false;
    const typeName = node.type?.name;
    if (!typeName) return false;
    if (typeName === 'listItem') {
      return false;
    }
    if (node.type?.spec && node.type.spec.tableRole) {
      return false;
    }
    return true;
  };

  const findIndentableBlockAtSelection = (): { pos: number; node: ProseMirrorNode } | null => {
    const selection = editor.state.selection;
    if (selection instanceof NodeSelection && isIndentableNode(selection.node)) {
      return { pos: selection.from, node: selection.node };
    }

    const { $from } = selection;
    for (let depth = $from.depth; depth >= 1; depth -= 1) {
      const node = $from.node(depth);
      if (!isIndentableNode(node)) {
        continue;
      }
      return { pos: $from.before(depth), node };
    }
    return null;
  };

  const findPreviousIndentableSibling = (pos: number): { pos: number; node: ProseMirrorNode } | null => {
    const doc = editor.state.doc;
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();

    if (index <= 0) {
      return null;
    }

    const parentStart = $pos.start();
    let offset = 0;
    let last: { pos: number; node: ProseMirrorNode } | null = null;

    for (let i = 0; i < index; i += 1) {
      const child = parent.child(i);
      const childPos = parentStart + offset;
      offset += child.nodeSize;
      if (isIndentableNode(child)) {
        last = { pos: childPos, node: child };
      }
    }

    return last;
  };

  const getIndentDepthAtSelection = (node: ProseMirrorNode): number => {
    return normalizeIndentAttr(node.attrs?.indent);
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
    indentBlock: () => {
      const timestamp = new Date().toISOString();
      if (isSelectionInListItem()) {
        console.warn(`[WARNING][Commands] ${timestamp} Indent block ignored: in listItem`);
        return false;
      }

      const target = findIndentableBlockAtSelection();
      if (!target) {
        console.error(`[ERROR][Commands] ${timestamp} Indent block failed: no target block`);
        return false;
      }

      const depth = getIndentDepthAtSelection(target.node);
      const prev = findPreviousIndentableSibling(target.pos);
      if (!prev) {
        console.warn(`[WARNING][Commands] ${timestamp} Indent block blocked: no parent block`, {
          depth,
          targetPos: target.pos,
          targetType: target.node.type.name,
        });
        notifyHostWarn('INDENT_MAX_DEPTH', INDENT_MAX_DEPTH_MESSAGE, {
          depth,
          maxDepth: INDENT_LEVEL_MAX,
          targetPos: target.pos,
          targetType: target.node.type.name,
        });
        return false;
      }
      const prevDepth = getIndentDepthAtSelection(prev.node);
      const allowedDepth = Math.min(INDENT_LEVEL_MAX, prevDepth + 1);
      if (depth >= allowedDepth) {
        console.warn(`[WARNING][Commands] ${timestamp} Indent block blocked: depth limit`, {
          depth,
          allowedDepth,
          prevDepth,
          prevPos: prev.pos,
          targetPos: target.pos,
        });
        notifyHostWarn('INDENT_MAX_DEPTH', INDENT_MAX_DEPTH_MESSAGE, {
          depth,
          allowedDepth,
          prevDepth,
          maxDepth: INDENT_LEVEL_MAX,
          prevPos: prev.pos,
          targetPos: target.pos,
        });
        return false;
      }

      const nextDepth = Math.min(allowedDepth, depth + 1);
      const selection = editor.state.selection;
      const attrs = {
        ...(target.node.attrs || {}),
        indent: nextDepth,
      };
      const tr = editor.state.tr.setNodeMarkup(target.pos, undefined, attrs);
      let mappedSelection: Selection;
      try {
        mappedSelection = selection.map(tr.doc, tr.mapping);
      } catch (error) {
        console.error(`[ERROR][Commands] ${timestamp} Indent block failed: selection mapping error`, {
          error,
          selectionFrom: selection.from,
          selectionTo: selection.to,
          targetPos: target.pos,
          targetType: target.node.type.name,
        });
        DEBUG.error('Commands', 'Indent block selection mapping failed', error);
        return false;
      }
      editor.view.dispatch(tr.setSelection(mappedSelection));
      console.log(`[SUCCESS][Commands] ${timestamp} Indent block applied`, { depth: nextDepth });
      return true;
    },
    outdentBlock: () => {
      const timestamp = new Date().toISOString();
      if (isSelectionInListItem()) {
        console.warn(`[WARNING][Commands] ${timestamp} Outdent block ignored: in listItem`);
        return false;
      }

      const target = findIndentableBlockAtSelection();
      if (!target) {
        console.error(`[ERROR][Commands] ${timestamp} Outdent block failed: no target block`);
        return false;
      }

      const depth = getIndentDepthAtSelection(target.node);
      if (depth <= 0) {
        console.warn(`[WARNING][Commands] ${timestamp} Outdent block ignored: no indent`);
        return false;
      }

      const nextDepth = Math.max(0, depth - 1);
      const selection = editor.state.selection;
      const attrs = {
        ...(target.node.attrs || {}),
        indent: nextDepth,
      };
      const tr = editor.state.tr.setNodeMarkup(target.pos, undefined, attrs);
      let mappedSelection: Selection;
      try {
        mappedSelection = selection.map(tr.doc, tr.mapping);
      } catch (error) {
        console.error(`[ERROR][Commands] ${timestamp} Outdent block failed: selection mapping error`, {
          error,
          selectionFrom: selection.from,
          selectionTo: selection.to,
          targetPos: target.pos,
          targetType: target.node.type.name,
        });
        DEBUG.error('Commands', 'Outdent block selection mapping failed', error);
        return false;
      }
      editor.view.dispatch(tr.setSelection(mappedSelection));
      console.log(`[SUCCESS][Commands] ${timestamp} Outdent block applied`, { depth: nextDepth });
      return true;
    },
    indentListItem: () => {
      const timestamp = new Date().toISOString();
      const listItemPos = resolveListItemPosFromSelection();
      if (listItemPos === null) {
        console.error(`[ERROR][Commands] ${timestamp} List indent failed: not in listItem`);
        return false;
      }
      const depth = getListItemDepthAtPos(listItemPos + 1);
      if (depth >= LIST_MAX_DEPTH) {
        console.warn(`[WARNING][Commands] ${timestamp} List indent blocked: max depth`, {
          depth,
          maxDepth: LIST_MAX_DEPTH,
          selectionFrom: editor.state.selection.from,
        });
        notifyHostWarn(
          'LIST_INDENT_MAX_DEPTH',
          INDENT_MAX_DEPTH_MESSAGE,
          {
            depth,
            maxDepth: LIST_MAX_DEPTH,
            selectionFrom: editor.state.selection.from,
          }
        );
        return false;
      }
      const listItem = editor.state.schema.nodes.listItem;
      if (!listItem) {
        console.error(`[ERROR][Commands] ${timestamp} listItem node not found`);
        return false;
      }
      const selectionOk = ensureListItemSelection(listItemPos);
      if (!selectionOk) {
        console.error(`[ERROR][Commands] ${timestamp} List indent failed: selection not in listItem`, {
          listItemPos,
          selectionFrom: editor.state.selection.from,
        });
        return false;
      }
      const ok = sinkListItem(listItem)(editor.state, editor.view.dispatch, editor.view);
      if (ok) {
        console.log(`[SUCCESS][Commands] ${timestamp} List indent applied`, {
          selectionFrom: editor.state.selection.from,
        });
      } else {
        console.warn(`[WARNING][Commands] ${timestamp} List indent blocked`, {
          selectionFrom: editor.state.selection.from,
        });
        notifyHostWarn(
          'LIST_INDENT_MAX_DEPTH',
          INDENT_MAX_DEPTH_MESSAGE,
          {
            depth,
            maxDepth: LIST_MAX_DEPTH,
            selectionFrom: editor.state.selection.from,
          }
        );
      }
      return ok;
    },
    outdentListItem: () => {
      const timestamp = new Date().toISOString();
      const listItemPos = resolveListItemPosFromSelection();
      if (listItemPos === null) {
        console.error(`[ERROR][Commands] ${timestamp} List outdent failed: not in listItem`);
        return false;
      }
      const listItem = editor.state.schema.nodes.listItem;
      if (!listItem) {
        console.error(`[ERROR][Commands] ${timestamp} listItem node not found`);
        return false;
      }
      const selectionOk = ensureListItemSelection(listItemPos);
      if (!selectionOk) {
        console.error(`[ERROR][Commands] ${timestamp} List outdent failed: selection not in listItem`, {
          listItemPos,
          selectionFrom: editor.state.selection.from,
        });
        return false;
      }
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
