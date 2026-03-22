/**
 * Webview logger (debug-gated).
 * - Logs are emitted only when debug is enabled.
 * - Designed to avoid hot-path overhead when disabled.
 */

export type LogLevel = 'INFO' | 'DEBUG' | 'STATES' | 'SUCCESS' | 'WARNING' | 'ERROR';

let debugEnabled = false;

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info ? console.info.bind(console) : console.log.bind(console),
};

const noop = (): void => {};

const applyConsoleOverride = (): void => {
  if (debugEnabled) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    return;
  }
  console.log = noop;
  console.warn = noop;
  console.error = noop;
  console.info = noop;
};

export const setDebugEnabled = (enabled: boolean): void => {
  debugEnabled = enabled;
  applyConsoleOverride();
};

export const isDebugEnabled = (): boolean => {
  return debugEnabled;
};

applyConsoleOverride();

const write = (
  level: LogLevel,
  module: string,
  message: string,
  details?: Record<string, unknown>
): void => {
  if (!debugEnabled) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${level}][${module}] ${timestamp}`;

  if (level === 'WARNING') {
    if (details) {
      console.warn(prefix, message, details);
      return;
    }
    console.warn(prefix, message);
    return;
  }

  if (level === 'ERROR') {
    if (details) {
      console.error(prefix, message, details);
      return;
    }
    console.error(prefix, message);
    return;
  }

  if (details) {
    console.log(prefix, message, details);
    return;
  }
  console.log(prefix, message);
};

export const createLogger = (module: string) => {
  return {
    info: (message: string, details?: Record<string, unknown>) => write('INFO', module, message, details),
    debug: (message: string, details?: Record<string, unknown>) => write('DEBUG', module, message, details),
    states: (message: string, details?: Record<string, unknown>) => write('STATES', module, message, details),
    success: (message: string, details?: Record<string, unknown>) => write('SUCCESS', module, message, details),
    warn: (message: string, details?: Record<string, unknown>) => write('WARNING', module, message, details),
    error: (message: string, details?: Record<string, unknown>) => write('ERROR', module, message, details),
  };
};
