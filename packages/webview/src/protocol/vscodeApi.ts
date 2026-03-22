/**
 * VS Code API bridge (webview-only)
 *
 * 役割: `acquireVsCodeApi()` をグローバルに露出せず、必要な箇所へ最小限の送信関数だけ渡す。
 * 背景: iframe など同一オリジンのコンテンツに VS Code API が見えると危険なため。
 */

export type VsCodePostMessage = (message: unknown) => void;

let postMessageImpl: VsCodePostMessage | null = null;

export const setVsCodePostMessage = (postMessage: VsCodePostMessage | null): void => {
  postMessageImpl = postMessage;
};

export const postToVsCode = (message: unknown): boolean => {
  if (!postMessageImpl) {
    return false;
  }
  postMessageImpl(message);
  return true;
};

