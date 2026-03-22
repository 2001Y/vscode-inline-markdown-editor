import * as path from 'path';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

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

  const baseDir = path.join(os.tmpdir(), `inlinemark-vscode-test-${process.pid}`);
  const userDataDir = path.join(baseDir, 'user-data');
  const extensionsDir = path.join(baseDir, 'extensions');

  console.log(`[INFO][TestRunner] ${timestamp} Launch args set.`, {
    userDataDir,
    extensionsDir,
  });

  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, './index');

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [`--user-data-dir=${userDataDir}`, `--extensions-dir=${extensionsDir}`],
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
  process.exit(1);
});
