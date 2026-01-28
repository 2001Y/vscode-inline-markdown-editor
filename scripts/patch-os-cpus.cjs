/**
 * Patch os.cpus() to return at least one CPU.
 *
 * Background:
 * - Some sandboxed environments report os.cpus().length === 0.
 * - secretlint (used by vsce) passes os.cpus().length to p-map concurrency.
 * - p-map throws if concurrency < 1.
 *
 * This patch is loaded via NODE_OPTIONS=--require to keep vsce/secretlint
 * stable without modifying global node_modules.
 */

const os = require('os');

const originalCpus = os.cpus;

os.cpus = () => {
  try {
    const cpus = originalCpus();
    if (Array.isArray(cpus) && cpus.length > 0) {
      return cpus;
    }
  } catch {
    // fall through to stub
  }

  return [
    {
      model: 'unknown',
      speed: 0,
      times: {
        user: 0,
        nice: 0,
        sys: 0,
        idle: 0,
        irq: 0,
      },
    },
  ];
};
