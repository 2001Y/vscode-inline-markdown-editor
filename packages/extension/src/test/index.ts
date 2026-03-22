import { runRegisteredTests } from './extension.test';

export const run = async (): Promise<void> => {
  await runRegisteredTests();
};
