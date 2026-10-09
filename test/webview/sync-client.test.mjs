import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncClient } from '../../.test-webview/protocol/client.js';

function fixture(callbacks = {}) {
  const posts = [];
  const previousWindow = globalThis.window;
  const previousApi = globalThis.acquireVsCodeApi;
  globalThis.window = { addEventListener() {} };
  globalThis.acquireVsCodeApi = () => ({ postMessage: message => posts.push(message), getState: () => null, setState() {} });
  try {
    const client = new SyncClient({ onInit() {}, onDocChanged() {}, onError() {}, ...callbacks });
    return { client, posts };
  } finally {
    globalThis.window = previousWindow;
    globalThis.acquireVsCodeApi = previousApi;
  }
}
const init = debug => ({
  v: 1, type: 'init', sessionId: 'synthetic-session', clientId: 'synthetic-client',
  version: 1, content: 'hello', i18n: {},
  config: { debug: { enabled: debug }, sync: { debounceMs: 250, timeoutMs: 3000 } },
});

test('omitted optional state callback is resolved before real init processing', () => {
  let initialized = 0;
  const { client, posts } = fixture({ onInit: () => initialized++ });
  assert.doesNotThrow(() => client.handleMessage({ data: init(false) }));
  assert.equal(initialized, 1);
  assert.ok(posts.some(message => message.type === 'initAck'));
  assert.equal(client.getShadowText(), 'hello');
});

test('non-protocol envelopes are ignored before asserting the sync-message union', () => {
  let errors = 0;
  const { client, posts } = fixture({ onError: () => errors++ });
  for (const data of [null, 'text', { type: 'editorCommand', v: 1 }, { type: 'inlineMarkPreviewHeight' }, { type: {} }, { type: 'other' }]) {
    assert.doesNotThrow(() => client.handleMessage({ data }));
  }
  assert.equal(errors, 0);
  assert.equal(posts.length, 0);
});

test('TRACE logs preserve session identity while debug-disabled INFO is suppressed', () => {
  const { client, posts } = fixture();
  client.handleMessage({ data: init(false) });
  posts.length = 0;
  client.emitHostLog('INFO', 'disabled');
  assert.equal(posts.length, 0);
  client.handleMessage({ data: init(true) });
  posts.length = 0;
  client.emitHostLog('TRACE', 'trace');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].level, 'TRACE');
  assert.equal(posts[0].sessionId, 'synthetic-session');
});

test('resetSession cancels an edit that is still waiting for debounce', async () => {
  const { client, posts } = fixture();
  client.handleMessage({ data: init(false) });
  posts.length = 0;

  client.scheduleEdit(() => [{ start: 5, end: 5, text: 'stale' }]);
  client.resetSession();
  await new Promise(resolve => setTimeout(resolve, 300));

  assert.deepEqual(posts.map(message => message.type), ['ready']);

  // Complete the reset handshake so its watchdog does not outlive the test.
  client.handleMessage({
    data: { ...init(false), sessionId: 'reset-session', content: 'authoritative' },
  });
});

test('a fresh init cancels an edit left over from the previous session', async () => {
  const { client, posts } = fixture();
  client.handleMessage({ data: init(false) });
  posts.length = 0;

  client.scheduleEdit(() => [{ start: 5, end: 5, text: 'stale' }]);
  client.handleMessage({
    data: { ...init(false), sessionId: 'reset-session', content: 'authoritative' },
  });
  await new Promise(resolve => setTimeout(resolve, 300));

  assert.deepEqual(posts.map(message => message.type), ['initAck']);
});
