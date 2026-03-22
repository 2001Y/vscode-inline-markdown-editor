/**
 * デバッグログユーティリティ
 * UI コンポーネントの問題診断用
 */

import { isDebugEnabled, setDebugEnabled } from '../logger.js';

const getDebugEnabled = (): boolean => {
  return isDebugEnabled();
};

let groupDepth = 0;

export const DEBUG = {
  /** デバッグモード有効/無効 */
  get enabled(): boolean {
    return getDebugEnabled();
  },

  /** デバッグモードを有効化 */
  enable(): void {
    setDebugEnabled(true);
    console.log('%c[inlineMark] Debug mode enabled', 'color: green; font-weight: bold');
  },

  /** デバッグモードを無効化 */
  disable(): void {
    setDebugEnabled(false);
    console.log('%c[inlineMark] Debug mode disabled', 'color: gray');
  },

  /** 通常ログ */
  log(module: string, msg: string, data?: unknown): void {
    if (!getDebugEnabled()) {return;}
    const timestamp = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
      console.log(`%c[${module}] ${timestamp} ${msg}`, 'color: #4a9eff', data);
    } else {
      console.log(`%c[${module}] ${timestamp} ${msg}`, 'color: #4a9eff');
    }
  },

  /** 警告ログ */
  warn(module: string, msg: string, data?: unknown): void {
    if (!getDebugEnabled()) {return;}
    const timestamp = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
      console.warn(`%c[${module}] ${timestamp} ${msg}`, 'color: orange', data);
    } else {
      console.warn(`%c[${module}] ${timestamp} ${msg}`, 'color: orange');
    }
  },

  /** エラーログ（常に出力） */
  error(module: string, msg: string, data?: unknown): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
      console.error(`%c[${module}] ${timestamp} ${msg}`, 'color: red; font-weight: bold', data);
    } else {
      console.error(`%c[${module}] ${timestamp} ${msg}`, 'color: red; font-weight: bold');
    }
  },

  /** グループ開始 */
  group(module: string, label: string): void {
    if (!getDebugEnabled()) {return;}
    console.groupCollapsed(`%c[${module}] ${label}`, 'color: #4a9eff');
    groupDepth += 1;
  },

  /** グループ終了 */
  groupEnd(): void {
    if (groupDepth <= 0) {
      groupDepth = 0;
      return;
    }
    groupDepth -= 1;
    console.groupEnd();
  },

  /** 要素の位置情報をログ */
  logRect(module: string, label: string, rect: DOMRect | { left: number; top: number; width: number; height: number }): void {
    if (!getDebugEnabled()) {return;}
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`%c[${module}] ${timestamp} ${label}`, 'color: #4a9eff', {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  },
};

// グローバルに公開（DevToolsからアクセス可能に）
declare global {
  interface Window {
    inlineMarkDebug: typeof DEBUG;
  }
}
if (typeof window !== 'undefined') {
  window.inlineMarkDebug = DEBUG;
}
