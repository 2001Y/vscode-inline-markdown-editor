const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDiff, applyChangesToText, isChangeGuardExceeded } = require('../../.test-out/packages/webview/src/editor/diffEngine.js');

// These verify patch transport, not Tiptap Markdown parse/serialize fidelity.
const fixtures = {
  empty: '',
  frontmatter: '---\ntitle: 日本語\ntags: [a, b]\n---\n\n# Hello\n',
  crlf: '# Title\r\n\r\nTwo spaces  \r\nend\r\n',
  noFinalNewline: 'text without final newline',
  table: '| A | B |\n| --- | --- |\n| 日本語 | 😀 |\n',
  nestedList: '- one\n  - two\n    1. three\n',
  raw: ':::custom\n<widget value="x">raw</widget>\n:::\n',
  mermaid: '```mermaid\ngraph TD\n  A --> B\n```\n',
  unicode: '😀\u{1F9D1}\u200D\u{1F4BB} 日本語 e\u0301\n',
};

function assertPatch(before, after) {
  const { changes, metrics } = computeDiff(before, after);
  let end = 0;
  for (const change of changes) {
    assert.ok(Number.isSafeInteger(change.start));
    assert.ok(Number.isSafeInteger(change.end));
    assert.ok(change.start >= end);
    assert.ok(change.end >= change.start && change.end <= before.length);
    end = change.end;
  }
  assert.equal(applyChangesToText(before, changes), after);
  assert.equal(metrics.hunkCount, changes.length);
}

for (const [name, source] of Object.entries(fixtures)) {
  test(`${name}: identical content produces no edits`, () => {
    assert.deepEqual(computeDiff(source, source), {
      changes: [], metrics: { changedChars: 0, changedRatio: 0, hunkCount: 0 },
    });
  });
  test(`${name}: insertion, deletion and reverse transport are exact`, () => {
    const next = source + '追記 😀\n';
    assertPatch(source, next);
    assertPatch(next, source);
    assertPatch(source, '');
  });
}

test('separated edits retain original UTF-16 offsets and apply in reverse order', () => {
  const before = '😀 start\nuntouched middle\nend 日本語';
  assertPatch(before, '😀 START\nuntouched middle\nEND 日本語');
  assert.equal(applyChangesToText('abcdef', [{ start: 1, end: 2, text: 'XX' }, { start: 4, end: 5, text: '' }]), 'aXXcdf');
});

test('seeded edits round-trip through computeDiff and applyChangesToText', () => {
  let seed = 20261008;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const alphabet = ['a', ' ', '\n', '\r', '日', '😀', '-', '*', '|'];
  for (let i = 0; i < 300; i++) {
    const before = Array.from({ length: random() % 80 }, () => alphabet[random() % alphabet.length]).join('');
    const tokens = Array.from(before);
    const at = random() % (tokens.length + 1);
    tokens.splice(at, random() % 5, '追記😀');
    assertPatch(before, tokens.join(''));
  }
});

test('change guard thresholds are strict and cover empty original content', () => {
  const config = { maxChangedRatio: 0.5, maxChangedChars: 50, maxHunks: 2 };
  assert.equal(isChangeGuardExceeded({ changedRatio: 0.5, changedChars: 50, hunkCount: 2 }, config), false);
  for (const metrics of [
    { changedRatio: 0.51, changedChars: 1, hunkCount: 1 },
    { changedRatio: 0.1, changedChars: 51, hunkCount: 1 },
    { changedRatio: 0.1, changedChars: 1, hunkCount: 3 },
  ]) assert.equal(isChangeGuardExceeded(metrics, config), true);
  assert.equal(computeDiff('', 'x').metrics.changedRatio, 1);
});
