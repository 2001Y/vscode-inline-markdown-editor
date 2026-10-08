import * as path from 'path';
import * as os from 'os';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { mkdtempSync } from 'fs';
import { runVSCodeTestProcess } from './vscodeTestProcess';

const run = async (): Promise<void> => {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const envKey = 'ELECTRON_RUN_AS_NODE';
  const previousEnv = process.env[envKey];
  if (previousEnv !== undefined) {
    console.warn(`[WARNING][TestRunner] ${timestamp} ${envKey} detected; resetting for VS Code tests.`, {
      value: previousEnv,
    });
    delete process.env[envKey];
  }

  const baseDir = mkdtempSync(path.join(os.tmpdir(), 'inlinemark-vscode-test-'));
  const userDataDir = path.join(baseDir, 'user-data');
  const extensionsDir = path.join(baseDir, 'extensions');

  console.log(`[INFO][TestRunner] ${timestamp} Launch args set.`, {
    userDataDir,
    extensionsDir,
  });

  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, './index');

  try {
    const vscodeExecutablePath = await downloadAndUnzipVSCode({
      version: process.env.INLINEMARK_VSCODE_VERSION || 'stable',
      cachePath: process.env.INLINEMARK_VSCODE_CACHE || path.resolve(extensionDevelopmentPath, '.vscode-test'),
    });
    await runVSCodeTestProcess(vscodeExecutablePath, {
      extensionDevelopmentPath,
      extensionTestsPath,
      userDataDir,
      extensionsDir,
    });
    console.log(`[SUCCESS][TestRunner] ${new Date().toISOString()} Tests completed.`, {
      durationMs: Date.now() - startedAt,
    });
  } finally {
    if (previousEnv !== undefined) {
      process.env[envKey] = previousEnv;
    } else {
      delete process.env[envKey];
    }
  }
};

run().catch((error) => {
  console.error('Failed to run extension tests.');
  console.error(error);
  // Keep the event loop alive for bounded cleanup of our own timed-out child.
  process.exitCode = 1;
});
