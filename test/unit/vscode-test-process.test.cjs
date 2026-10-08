const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { buildVSCodeTestArguments, waitForVSCodeTestExit } = require('../../.test-out/packages/extension/src/test/vscodeTestProcess.js');

test('VS Code test arguments isolate profiles and preserve security defaults', () => {
  const args = buildVSCodeTestArguments({ extensionDevelopmentPath: '/synthetic/extension', extensionTestsPath: '/synthetic/extension/out/test', userDataDir: '/synthetic/user data', extensionsDir: '/synthetic/extensions' });
  assert.ok(args.includes('--user-data-dir=/synthetic/user data'));
  assert.ok(args.includes('--extensions-dir=/synthetic/extensions'));
  assert.ok(args.includes('--extensionTestsPath=/synthetic/extension/out/test'));
  assert.ok(!args.some(arg => /no-sandbox|disable-gpu-sandbox|disable-workspace-trust/.test(arg)));
});

test('test process succeeds only on exit zero without a termination signal', async () => {
  const child = new EventEmitter(); const result = waitForVSCodeTestExit(child);
  child.emit('close', 0, null); await result;
});

for (const [code, signal] of [[1, null], [null, 'SIGTRAP'], [null, 'SIGTERM'], [0, 'SIGTERM']]) {
  test(`test process rejects exit ${code} / signal ${signal}`, async () => {
    const child = new EventEmitter(); const result = waitForVSCodeTestExit(child);
    child.emit('close', code, signal); await assert.rejects(result);
  });
}

test('spawn failure cannot become a successful test result', async () => {
  const child = new EventEmitter(); const result = waitForVSCodeTestExit(child);
  child.emit('error', new Error('spawn failed')); child.emit('close', 0, null);
  await assert.rejects(result, /spawn failed/);
});


test('timeout remains failure even when SIGTERM leads to clean exit zero', async () => {
  const child = new EventEmitter();
  const signals = [];
  child.kill = signal => { signals.push(signal); child.emit('close', 0, null); return true; };
  await assert.rejects(waitForVSCodeTestExit(child, { timeoutMs: 5, shutdownGraceMs: 5 }), /timed out/);
  assert.deepEqual(signals, ['SIGTERM']);
});

test('timeout bounds cleanup for an owned child that ignores SIGTERM', async () => {
  const child = new EventEmitter();
  const signals = [];
  let stopped;
  const cleanup = new Promise(resolve => { stopped = resolve; });
  child.kill = signal => {
    signals.push(signal);
    if (signal === 'SIGKILL') { child.emit('close', null, signal); stopped(); }
    return true;
  };
  await assert.rejects(waitForVSCodeTestExit(child, { timeoutMs: 5, shutdownGraceMs: 5 }), /timed out/);
  await cleanup;
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});
