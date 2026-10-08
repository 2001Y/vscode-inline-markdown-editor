import { spawn, type ChildProcess } from 'child_process';

export interface VSCodeTestPaths {
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
  userDataDir: string;
  extensionsDir: string;
}

export const buildVSCodeTestArguments = (paths: VSCodeTestPaths): string[] => [
  `--user-data-dir=${paths.userDataDir}`,
  `--extensions-dir=${paths.extensionsDir}`,
  '--disable-updates',
  '--skip-welcome',
  '--skip-release-notes',
  `--extensionTestsPath=${paths.extensionTestsPath}`,
  `--extensionDevelopmentPath=${paths.extensionDevelopmentPath}`,
];

/** Success requires a clean process exit, never a matching stdout string. */
export const waitForVSCodeTestExit = (
  child: Pick<ChildProcess, 'once' | 'kill'>,
  { timeoutMs = 120000, shutdownGraceMs = 1500 } = {}
): Promise<void> => new Promise((resolve, reject) => {
  let settled = false;
  let closed = false;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = (error?: Error): void => {
    if (settled) {return;}
    settled = true;
    clearTimeout(timeoutTimer);
    if (error) {reject(error);} else {resolve();}
  };
  const timeoutTimer = setTimeout(() => {
    // Timeout is a failure even if graceful shutdown later reports exit 0.
    finish(new Error(`VS Code tests timed out after ${timeoutMs}ms`));
    if (!closed) {
      child.kill('SIGTERM');
      if (!closed) {
        forceTimer = setTimeout(() => {
          if (!closed) {child.kill('SIGKILL');}
        }, shutdownGraceMs);
      }
    }
  }, timeoutMs);
  child.once('error', (error) => finish(error));
  child.once('close', (code, signal) => {
    closed = true;
    if (forceTimer) {clearTimeout(forceTimer);}
    if (code === 0 && signal === null) {finish(); return;}
    finish(new Error(signal ? `VS Code tests terminated by ${signal}` : `VS Code tests exited with code ${String(code)}`));
  });
});

export const runVSCodeTestProcess = async (executable: string, paths: VSCodeTestPaths): Promise<void> => {
  // Preserve Chromium sandbox and workspace-trust defaults. The upstream
  // runTests helper injects sandbox-disable flags, so use its downloader only.
  const child = spawn(executable, buildVSCodeTestArguments(paths), {
    env: { ...process.env },
    stdio: 'inherit',
  });
  await waitForVSCodeTestExit(child);
};
