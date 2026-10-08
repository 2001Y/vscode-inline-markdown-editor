import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import {
  ParagraphNoShortcut, HeadingNoShortcut, BulletListNoShortcut,
  OrderedListNoShortcut, ListItemNoShortcut, BlockquoteNoShortcut,
  CodeBlockNoShortcut, HorizontalRuleNoShortcut,
} from '../../.test-webview/editor/disableKeyboardShortcuts.js';
import FrontmatterBlock from '../../.test-webview/editor/frontmatterBlockExtension.js';
import RawBlock from '../../.test-webview/editor/rawBlockExtension.js';
import HtmlToCodeBlock from '../../.test-webview/editor/htmlToCodeBlockExtension.js';

const helpers = { renderChildren: () => 'hello' };
const context = parentType => ({ index: 0, level: 0, parentType });
for (const extension of [ParagraphNoShortcut, HeadingNoShortcut, BulletListNoShortcut, OrderedListNoShortcut, BlockquoteNoShortcut, CodeBlockNoShortcut, HorizontalRuleNoShortcut]) {
  test(`${extension.name} renderer uses string parentType to avoid duplicate list indent markers`, () => {
    const node = { type: extension.name, attrs: { indent: 2, level: 2 }, content: [{ type: 'text', text: 'hello' }] };
    const nested = extension.config.renderMarkdown(node, helpers, context('listItem'));
    const top = extension.config.renderMarkdown(node, helpers, context('doc'));
    assert.ok(!nested.includes('<!-- inlineMark:indent='), nested);
    assert.ok(top.startsWith('<!-- inlineMark:indent=2 -->\n'), top);
  });
}

test('frontmatter renderer uses the installed helper and parent context contracts', () => {
  const node = { type: 'frontmatterBlock', attrs: { indent: 1 }, content: [{ type: 'text', text: '---\ntitle: test\n---' }] };
  const render = () => '---\ntitle: test\n---';
  const result = FrontmatterBlock.config.renderMarkdown(node, { renderChildren: render }, context('listItem'));
  assert.equal(result, '---\ntitle: test\n---\n');
});

test('empty HTML parse result is an empty node list, never a null node', () => {
  assert.deepEqual(HtmlToCodeBlock.config.parseMarkdown({ raw: ' \n ', type: 'html', block: true }, {}), []);
});

const codec = new MarkdownManager({ extensions: [
  Document, Text, ParagraphNoShortcut, HeadingNoShortcut,
  BulletListNoShortcut, OrderedListNoShortcut, ListItemNoShortcut,
  BlockquoteNoShortcut, CodeBlockNoShortcut, HorizontalRuleNoShortcut,
  FrontmatterBlock, RawBlock, HtmlToCodeBlock,
] });
const fixtures = {
  nestedList: '- alpha\n  - beta',
  unicode: '# 日本語 😀\n\n本文 e\u0301',
  frontmatter: '---\ntitle: test\n---\n\nhello',
  code: '```typescript\nconst answer = 42;\n```',
  raw: ':::custom\nhello\n:::',
};
for (const [name, source] of Object.entries(fixtures)) {
  test(`${name}: real Markdown codec stabilizes after parse/serialize`, () => {
    const parsed = codec.parse(source);
    const markdown = codec.serialize(parsed);
    assert.deepEqual(codec.parse(markdown), parsed);
    // This is semantic stability, not byte-for-byte fidelity of every dialect.
  });
}

test('real list serialization omits synthetic indent markers on its paragraph child', () => {
  const json = { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { indent: 2 }, content: [{ type: 'text', text: 'hello' }] }] }] }] };
  assert.equal(codec.serialize(json), '- hello');
});
