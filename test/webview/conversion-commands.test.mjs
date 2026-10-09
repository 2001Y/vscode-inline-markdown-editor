import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import {
  ParagraphNoShortcut, HeadingNoShortcut, CodeBlockNoShortcut, BlockquoteNoShortcut,
} from '../../.test-webview/editor/disableKeyboardShortcuts.js';

for (const kind of ['heading', 'codeBlock', 'blockquote']) {
  test(`paragraph to ${kind} applies supported attributes without losing indent or text`, () => {
    const editor = new Editor({
      element: null,
      extensions: [Document, Text, ParagraphNoShortcut, HeadingNoShortcut, CodeBlockNoShortcut, BlockquoteNoShortcut],
      content: { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 2 }, content: [{ type: 'text', text: 'hello' }] }] },
    });
    try {
      // focus() requires a mounted view and remains part of UI verification.
      let chain = editor.chain();
      chain = kind === 'heading' ? chain.setHeading({ level: 2 }) : kind === 'codeBlock' ? chain.setCodeBlock() : chain.setBlockquote();
      assert.equal(chain.updateAttributes(kind, { indent: 2 }).run(), true);
      const node = editor.state.doc.firstChild;
      assert.equal(node.type.name, kind);
      assert.equal(node.attrs.indent, 2);
      assert.equal(node.textContent, 'hello');
      if (kind === 'heading') assert.equal(node.attrs.level, 2);
    } finally { editor.destroy(); }
  });
}
