import * as path from 'path';
import { runTests } from '@vscode/test-electron';

const run = async (): Promise<void> => {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, './index');

  await runTests({ extensionDevelopmentPath, extensionTestsPath });
};

run().catch((error) => {
  console.error('Failed to run extension tests.');
  console.error(error);
  process.exit(1);
});
