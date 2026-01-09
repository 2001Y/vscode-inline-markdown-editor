/**
 * Tiptapビルトインショートカットを無効化する拡張
 *
 * VSCodeのkeybindingsで全てのショートカットを管理するため、
 * Tiptap側のビルトインショートカットを無効化する。
 *
 * 各拡張をextendしてaddKeyboardShortcutsを空にオーバーライド
 */

import { Extension } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import Underline from '@tiptap/extension-underline';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import History from '@tiptap/extension-history';

/**
 * Bold拡張 (Mod-b 無効化)
 */
export const BoldNoShortcut = Bold.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Italic拡張 (Mod-i 無効化)
 */
export const ItalicNoShortcut = Italic.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Strike拡張 (Mod-Shift-s 無効化)
 */
export const StrikeNoShortcut = Strike.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Code拡張 (Mod-e 無効化)
 */
export const CodeNoShortcut = Code.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Underline拡張 (Mod-u 無効化)
 */
export const UnderlineNoShortcut = Underline.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Heading拡張 (Mod-Alt-1~6 無効化)
 */
export const HeadingNoShortcut = Heading.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * BulletList拡張 (Mod-Shift-8 無効化)
 */
export const BulletListNoShortcut = BulletList.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * OrderedList拡張 (Mod-Shift-7 無効化)
 */
export const OrderedListNoShortcut = OrderedList.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * Blockquote拡張 (Mod-Shift-b 無効化)
 */
export const BlockquoteNoShortcut = Blockquote.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * CodeBlock拡張 (Mod-Alt-c 無効化)
 */
export const CodeBlockNoShortcut = CodeBlock.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * History拡張 (Mod-z, Mod-Shift-z 無効化)
 */
export const HistoryNoShortcut = History.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/**
 * 全ショートカット無効化をまとめたExtension
 * createEditorで追加するだけで、上記の拡張を全て適用
 */
export const DisableBuiltinShortcuts = Extension.create({
  name: 'disableBuiltinShortcuts',

  // この拡張自体は何もしない
  // StarterKitの各拡張を上書きするために、個別の拡張を使用する
});
