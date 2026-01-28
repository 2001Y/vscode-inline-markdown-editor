/**
 * Host notifier bridge
 *
 * 役割: Editor 内部から VS Code の通知を出すための軽量ブリッジ
 * 不変条件: notifier が未設定でも処理は継続し、ログで可視化する
 */

import type { Remediation } from '../protocol/types.js';

export type HostNotifyLevel = 'INFO' | 'WARN' | 'ERROR';

export type HostNotify = (
  level: HostNotifyLevel,
  code: string,
  message: string,
  remediation: Remediation[],
  details?: Record<string, unknown>
) => void;

let hostNotify: HostNotify | null = null;

export const setHostNotifier = (notify: HostNotify | null): void => {
  hostNotify = notify;
};

const fallbackLog = (level: HostNotifyLevel, code: string, message: string, details?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  const prefix = `[${level}][HostNotify] ${timestamp} ${code}`;
  const logFn =
    level === 'ERROR'
      ? console.error
      : level === 'WARN'
        ? console.warn
        : console.info;
  if (details) {
    // eslint-disable-next-line no-console
    logFn(prefix, message, details);
    return;
  }
  // eslint-disable-next-line no-console
  logFn(prefix, message);
};

export const notifyHostWarn = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  remediation: Remediation[] = []
): void => {
  if (hostNotify) {
    hostNotify('WARN', code, message, remediation, details);
    return;
  }
  fallbackLog('WARN', code, message, details);
};

export const notifyHostInfo = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  remediation: Remediation[] = []
): void => {
  if (hostNotify) {
    hostNotify('INFO', code, message, remediation, details);
    return;
  }
  fallbackLog('INFO', code, message, details);
};

export const notifyHostError = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  remediation: Remediation[] = []
): void => {
  if (hostNotify) {
    hostNotify('ERROR', code, message, remediation, details);
    return;
  }
  fallbackLog('ERROR', code, message, details);
};
