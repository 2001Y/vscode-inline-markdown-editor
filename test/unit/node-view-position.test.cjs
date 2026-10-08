const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Schema } = require('@tiptap/pm/model');
const { resolveNodeViewPosition } = require('../../.test-out/packages/webview/src/editor/nodeViewPosition.js');
const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, text: { group: 'inline' },
  paragraph: { group: 'block', content: 'text*' },
  codeBlock: { group: 'block', content: 'text*' },
} });
const doc = schema.node('doc', null, [schema.node('codeBlock', null, schema.text('code')), schema.node('paragraph', null, schema.text('text'))]);

test('code label position accepts a current code node and rejects another node type', () => {
  assert.equal(resolveNodeViewPosition(() => 0, doc, 'codeBlock'), 0);
  assert.equal(resolveNodeViewPosition(() => 6, doc, 'codeBlock'), null);
});

test('detached/stale NodeViews never apply label edits at an invented position', () => {
  for (const getPos of [undefined, false, () => undefined, () => -1, () => 0.5, () => NaN, () => doc.content.size + 1, () => { throw new Error('detached'); }]) {
    assert.equal(resolveNodeViewPosition(getPos, doc, 'codeBlock'), null);
  }
});
