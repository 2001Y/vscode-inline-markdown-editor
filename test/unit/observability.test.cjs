const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let debug = false;
let observability;
try {
  Module._load = function (id, ...rest) {
    if (id === './logger.js') return { isDebugEnabled: () => debug, createLogger: () => ({ info() {}, debug() {}, warn() {}, error() {} }) };
    return originalLoad.call(this, id, ...rest);
  };
  observability = require('../../.test-out/packages/webview/src/observability.js');
} finally { Module._load = originalLoad; }

test('debug-disabled diagnostics produce neither INFO/DEBUG IPC nor viewport work', () => {
  debug = false;
  const events = [], frames = [];
  observability.setObservabilityReporter((...event) => events.push(event));
  observability.logObservabilityEvent('INFO', 'info');
  observability.logObservabilityEvent('DEBUG', 'debug');
  observability.scheduleObservabilityCallback(() => assert.fail('probe ran'), 1, fn => frames.push(fn));
  assert.equal(events.length, 0);
  assert.equal(frames.length, 0);
  observability.logObservabilityEvent('WARNING', 'real-warning');
  observability.logObservabilityEvent('ERROR', 'real-error');
  assert.deepEqual(events.map(e => e[0]), ['WARN', 'ERROR']);
});

test('stale RAF callback is cancelled across init generations and sessions', () => {
  debug = true;
  const frames = [];
  const schedule = fn => frames.push(fn);
  let calls = 0;
  const trace = { seq: 1, reason: 'reopen', targetUri: 'file:///synthetic.md' };
  observability.setCurrentOpenTrace(trace, 1, 'session-a');
  observability.scheduleObservabilityCallback(() => calls++, 2, schedule);
  observability.setCurrentOpenTrace(trace, 2, 'session-b');
  while (frames.length) frames.shift()(0);
  assert.equal(calls, 0);
  observability.scheduleObservabilityCallback(() => calls++, 1, schedule);
  while (frames.length) frames.shift()(0);
  assert.equal(calls, 1);
});

test('diagnostic payload records current generation and session even without an explicit trace', () => {
  debug = true;
  const events = [];
  observability.setObservabilityReporter((...event) => events.push(event));
  observability.setCurrentOpenTrace(null, 3, 'session-c');
  observability.logObservabilityEvent('INFO', 'direct-open');
  assert.equal(events[0][2].initGeneration, 3);
  assert.equal(events[0][2].sessionId, 'session-c');
  assert.equal(events[0][2].seq, null);
});
