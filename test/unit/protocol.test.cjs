const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidWebviewMessage, areValidReplaces } = require('../../.test-out/packages/extension/src/protocol/messages.js');
const edit = (changes, extra = {}) => ({ v: 1, type: 'edit', txId: 1, baseVersion: 1, changes, ...extra });

test('valid edits accept no-op, insertion, deletion and adjacent ranges', () => {
  for (const changes of [[], [{ start: 0, end: 0, text: '😀' }], [{ start: 0, end: 2, text: '' }], [{ start: 0, end: 2, text: 'a' }, { start: 2, end: 4, text: 'b' }]]) {
    assert.equal(isValidWebviewMessage(edit(changes)), true);
  }
});

test('edit counters reject non-finite, fractional, negative and unsafe values', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    for (const key of ['txId', 'baseVersion']) assert.equal(isValidWebviewMessage(edit([], { [key]: value })), false, `${key}: ${value}`);
  }
});

test('edit ranges reject invalid numbers, reversed, overlapping and unsorted ranges', () => {
  for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0']) {
    for (const key of ['start', 'end']) assert.equal(isValidWebviewMessage(edit([{ start: 0, end: 2, text: 'x', [key]: value }])), false, `${key}: ${value}`);
  }
  for (const changes of [
    [{ start: 3, end: 2, text: '' }],
    [{ start: 0, end: 3, text: 'x' }, { start: 2, end: 4, text: 'y' }],
    [{ start: 3, end: 4, text: 'x' }, { start: 0, end: 1, text: 'y' }],
    [{ start: 1, end: 1, text: 'x' }, { start: 1, end: 1, text: 'y' }],
    [null], [{ start: 0, end: 0, text: null }],
  ]) assert.equal(isValidWebviewMessage(edit(changes)), false);
});

test('document bounds reject offsets that VS Code positionAt would clamp', () => {
  assert.equal(areValidReplaces([{ start: 0, end: 4, text: '' }], 3), false);
  assert.equal(areValidReplaces([{ start: 4, end: 4, text: 'x' }], 3), false);
  assert.equal(areValidReplaces([{ start: 3, end: 3, text: 'x' }], 3), true);
  assert.equal(areValidReplaces([{ start: 0, end: 0, text: 'x' }], 0), true);
  for (const length of [-1, NaN, Infinity, 0.5]) assert.equal(areValidReplaces([], length), false);
});

test('invalid envelopes and unsupported versions are rejected', () => {
  for (const msg of [null, [], 'edit', {}, { v: 2, type: 'ready' }, { v: 1, type: 'unknown' }]) assert.equal(isValidWebviewMessage(msg), false);
});
