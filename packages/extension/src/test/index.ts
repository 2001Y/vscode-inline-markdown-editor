import { runRegisteredTests } from './extension.test';

export const runTests = async (): Promise<void> => {
  await runRegisteredTests();
};
