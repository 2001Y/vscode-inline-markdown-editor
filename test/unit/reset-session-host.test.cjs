const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let choice;
let warnings;
let notices;
const vscodeMock = {
  l10n: { t: text => text },
  env: { language: 'en' },
  window: {
    createOutputChannel: () => ({ appendLine() {} }),
    showWarningMessage: async (...args) => { warnings.push(args); return choice; },
    showInformationMessage: () => { notices++; },
  },
};
let InlineMarkProvider;
try {
  Module._load = function (id, ...rest) {
    return id === 'vscode' ? vscodeMock : originalLoad.call(this, id, ...rest);
  };
  ({ InlineMarkProvider } = require('../../.test-out/packages/extension/src/editors/inlineMarkProvider.js'));
} finally { Module._load = originalLoad; }
function fixture() {
  warnings = []; notices = 0;
  const sent = [];
  const document = { uri: { toString: () => 'file:///synthetic/reset.md' }, version: 9, getText: () => 'authoritative 日本語😀' };
  const panel = { ready: true, clientId: 'client', panel: { webview: { postMessage: async message => sent.push(message) } } };
  const state = { sessionId: 'old-session', selfChangeVersions: new Set([8]), panels: new Map([['client', panel]]) };
  const provider = Object.assign(Object.create(InlineMarkProvider.prototype), {
    documentStates: new Map([[document.uri.toString(), state]]),
    getWebviewConfig: () => ({}), loadI18nBundle: async () => ({}),
  });
  return { document, state, sent, panel, provider };
}
for (const result of [undefined, 'Cancel']) {
  test(`host reset ${result === undefined ? 'dismiss' : 'cancel'} preserves session and sends no init`, async () => {
    choice = result;
    const { provider, document, state, sent } = fixture();
    assert.equal(await provider.resetSession(document), false);
    assert.equal(state.sessionId, 'old-session');
    assert.deepEqual([...state.selfChangeVersions], [8]);
    assert.deepEqual(sent, []);
    assert.equal(notices, 0);
    assert.equal(warnings[0][1].modal, true);
  });
}
test('host reset confirmation reinitializes from the current authoritative document', async () => {
  choice = 'Reset Session';
  const { provider, document, state, sent, panel } = fixture();
  assert.equal(await provider.resetSession(document), true);
  assert.notEqual(state.sessionId, 'old-session');
  assert.equal(state.selfChangeVersions.size, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'init');
  assert.equal(sent[0].content, document.getText());
  assert.equal(sent[0].version, 9);
  assert.equal(sent[0].sessionId, state.sessionId);
  assert.equal(panel.ready, true);
  assert.equal(notices, 1);
});
