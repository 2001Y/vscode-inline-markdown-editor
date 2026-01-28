/**
 * デバッグログユーティリティ
 * UI コンポーネントの問題診断用
 */

// VS Code webview環境ではlocalStorageが使用可能
const getDebugEnabled = (): boolean => {
  try {
    return localStorage.getItem('inlineMark.debug') === 'true';
  } catch {
    return false;
  }
};

let groupDepth = 0;

export const DEBUG = {
  /** デバッグモード有効/無効 */
  get enabled(): boolean {
    return getDebugEnabled();
  },

  /** デバッグモードを有効化 */
  enable(): void {
    try {
      localStorage.setItem('inlineMark.debug', 'true');
      console.log('%c[inlineMark] Debug mode enabled', 'color: green; font-weight: bold');
    } catch {
      console.warn('Cannot enable debug mode: localStorage not available');
    }
  },

  /** デバッグモードを無効化 */
  disable(): void {
    try {
      localStorage.removeItem('inlineMark.debug');
      console.log('%c[inlineMark] Debug mode disabled', 'color: gray');
    } catch {
      // ignore
    }
  },

  /** 通常ログ */
  log(module: string, msg: string, data?: unknown): void {
    if (!getDebugEnabled()) return;
    const timestamp = new Date().toISOString().slice(11, 23);
    if (data !== undefined) {
      console.log(`%c[${module}] ${timestamp} ${msg}`, 'color: #4a9eff', data);
    } else {
      console.log(`%c[${module}] ${timestamp} ${msg}`, 'color: #4a9eff');
    }
  },

  /** 警告ログ */
  warn(module: string, msg: string, data?: unknown): void {
    if (!getDebugEnabled()) return;
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
    if (!getDebugEnabled()) return;
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
    if (!getDebugEnabled()) return;
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
window.inlineMarkDebug = DEBUG;
