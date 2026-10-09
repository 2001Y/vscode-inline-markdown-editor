const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let execute = async () => undefined;
const uri = value => ({ scheme: 'file', fsPath: value, toString: () => `file://${value}` });
const mock = {
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    tabGroups: { activeTabGroup: { viewColumn: 1 } },
    showErrorMessage() {},
  },
  commands: { executeCommand: (...args) => execute(...args) },
  workspace: { fs: { stat: async () => ({ type: 1 }) } },
  Uri: { file: uri }, FileType: { File: 1 },
  TabInputText: class {}, TabInputTextDiff: class {}, TabInputCustom: class {},
};
let InlineMarkProvider, Logger;
try {
  Module._load = function (id, ...rest) { return id === 'vscode' ? mock : originalLoad.call(this, id, ...rest); };
  ({ InlineMarkProvider } = require('../../.test-out/packages/extension/src/editors/inlineMarkProvider.js'));
  ({ Logger } = require('../../.test-out/packages/extension/src/util/log.js'));
} finally { Module._load = originalLoad; }
const target = uri('/synthetic/page.md');
const trace = (seq, viewColumn = 1, createdAtMs = Date.now()) => ({ seq, viewColumn, createdAtMs, targetUri: target.toString() });
const provider = () => Object.assign(Object.create(InlineMarkProvider.prototype), { pendingOpenTraces: new Map(), disposables: [] });

test('pending traces match editor column and expire before consumption', () => {
  const p = provider();
  p.queueOpenTrace(trace(1, 1, Date.now() - 31000));
  p.queueOpenTrace(trace(2, 1));
  p.queueOpenTrace(trace(3, 2));
  assert.equal(p.takeQueuedOpenTrace(target, 2).seq, 3);
  assert.equal(p.takeQueuedOpenTrace(target, 2), null);
  assert.equal(p.takeQueuedOpenTrace(target, 1).seq, 2);
  assert.equal(p.takeQueuedOpenTrace(target, 1), null);
});

test('dropping one request preserves other pending requests', () => {
  const p = provider(); p.queueOpenTrace(trace(1)); p.queueOpenTrace(trace(2));
  p.dropQueuedOpenTrace(target, 1, 'settled');
  p.dropQueuedOpenTrace(target, 99, 'not-present');
  assert.equal(p.takeQueuedOpenTrace(target, 1).seq, 2);
  assert.equal(p.pendingOpenTraces.size, 0);
});

for (const fails of [false, true]) {
  test(`nested open ${fails ? 'failure' : 'existing-panel success'} leaves no stale trace`, async () => {
    const p = provider();
    let calls = 0;
    execute = async () => { calls++; if (fails) throw new Error('synthetic failure'); };
    await p.handleOpenNestedPage({ uri: uri('/synthetic/index.md') }, 'client', { type: 'openNestedPage', path: './page.md' });
    assert.equal(calls, 1);
    assert.equal(p.pendingOpenTraces.size, 0);
    assert.equal(p.takeQueuedOpenTrace(target, 1), null);
  });
}

test('provider disposal clears pending requests', () => {
  const p = provider(); p.queueOpenTrace(trace(1)); p.dispose();
  assert.equal(p.pendingOpenTraces.size, 0);
});

test('export masks nested trace URIs, arrays and URI queries without mutating input', () => {
  const logger = new Logger('test');
  const folders = [{ name: 'project', uri: uri('/synthetic/project') }];
  const details = {
    targetUri: 'file:///private/user/a.md?private=query',
    activeTab: { originalUri: 'git:/private/user/a.md?%7B%22path%22:%22/private/user/a.md%22%7D', modifiedUri: 'file:///synthetic/project/a.md' },
    activeTextEditor: { docUri: 'vscode-remote://host/private/user/b.md' },
    entries: [{ path: '/private/user/c.md' }],
    count: 3,
  };
  const before = JSON.stringify(details);
  const result = logger.maskDetailsForExport(details, folders);
  assert.equal(result.targetUri, '[external]/a.md');
  assert.equal(result.activeTab.originalUri, '[external]/a.md');
  assert.equal(result.activeTab.modifiedUri, 'workspace://project/a.md');
  assert.equal(result.activeTextEditor.docUri, '[external]/b.md');
  assert.equal(result.entries[0].path, '[external]/c.md');
  assert.equal(result.count, 3);
  assert.equal(JSON.stringify(details), before);
  assert.ok(!JSON.stringify(result).includes('/private/user'));
  assert.ok(!JSON.stringify(result).includes('private=query'));
});

test('workspace masking observes directory boundary and removes top-level URI query', () => {
  const logger = new Logger('test');
  const folders = [{ name: 'project', uri: uri('/synthetic/project') }];
  assert.equal(logger.maskPath('file:///synthetic/project-other/a.md', folders), '[external]/a.md');
  const result = JSON.parse(logger.maskExportContent(JSON.stringify({ docUri: 'file:///private/a.md?private=query', details: { targetUri: 'file:///private/b.md#secret' } }), folders));
  assert.equal(result.docUri, '[external]/a.md');
  assert.equal(result.details.targetUri, '[external]/b.md');
});

for (const fails of [false, true]) {
  test(`shared traced-open wrapper cleans up after ${fails ? 'rejection' : 'resolve without a new panel'}`, async () => {
    const p = provider();
    let calls = 0;
    const open = async () => { calls++; assert.equal(p.pendingOpenTraces.size, 1); if (fails) throw new Error('failed'); return 42; };
    if (fails) await assert.rejects(p.runWithOpenTrace(trace(1), open), /failed/);
    else assert.equal(await p.runWithOpenTrace(trace(1), open), 42);
    assert.equal(calls, 1);
    assert.equal(p.pendingOpenTraces.size, 0);
  });
}
