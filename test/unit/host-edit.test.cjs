const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let applyCalls = 0;
let positionCalls = 0;
const vscodeMock = {
  window: { createOutputChannel: () => ({ appendLine() {} }) },
  workspace: { applyEdit: async () => { applyCalls++; return true; } },
};

// This file gets its own Node test process. Only intercept the VS Code module
// while loading freshly compiled production code; never use a stale host build.
let InlineMarkProvider;
try {
  Module._load = function (id, ...rest) {
    return id === 'vscode' ? vscodeMock : originalLoad.call(this, id, ...rest);
  };
  ({ InlineMarkProvider } = require('../../.test-out/packages/extension/src/editors/inlineMarkProvider.js'));
} finally {
  Module._load = originalLoad;
}

function fixture() {
  applyCalls = 0;
  positionCalls = 0;
  const responses = [];
  const provider = Object.create(InlineMarkProvider.prototype);
  const document = {
    version: 1,
    getText: () => 'abc',
    uri: { toString: () => 'file:///synthetic.md' },
    positionAt() { positionCalls++; throw new Error('Range guard was bypassed'); },
  };
  const state = {
    panels: new Map([['client', { panel: { webview: { postMessage: async message => responses.push(message) } } }]]),
    sessionId: 'session',
    selfChangeVersions: new Map(),
  };
  return {
    responses, state,
    receive: changes => provider.onDidReceiveMessage(document, state, 'client', {
      v: 1, type: 'edit', txId: 1, baseVersion: 1, changes,
    }),
  };
}

for (const [name, changes] of [
  ['insertion beyond EOF', [{ start: 4, end: 4, text: 'X' }]],
  ['deletion beyond EOF', [{ start: 0, end: 4, text: '' }]],
]) {
  test(`host receive path rejects ${name} before conversion or applyEdit`, async () => {
    const { receive, responses, state } = fixture();
    await receive(changes);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'nack');
    assert.equal(responses[0].reason, 'applyFailed');
    assert.equal(responses[0].currentVersion, 1);
    assert.equal(state.selfChangeVersions.size, 0);
    assert.equal(positionCalls, 0);
    assert.equal(applyCalls, 0);
  });
}

test('host receive path preserves no-op acknowledgement', async () => {
  const { receive, responses, state } = fixture();
  await receive([]);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].type, 'ack');
  assert.equal(responses[0].outcome, 'noop');
  assert.equal(state.selfChangeVersions.size, 0);
  assert.equal(positionCalls, 0);
  assert.equal(applyCalls, 0);
});
