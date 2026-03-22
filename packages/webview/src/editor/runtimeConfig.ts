/**
 * Runtime config store (webview-only)
 *
 * 役割: Webview が受信した設定を、NodeView/ユーティリティから参照できるようにする。
 * 方針: ProseMirror doc に混ぜず、UI 状態/挙動はランタイムに閉じる。
 * 不変条件: ConfigChanged/init のたびに必ず更新されること。
 */

import type { WebviewConfig } from '../protocol/types.js';

let currentConfig: WebviewConfig | null = null;

export const setRuntimeConfig = (config: WebviewConfig): void => {
  currentConfig = config;
};

export const getRuntimeConfig = (): WebviewConfig | null => {
  return currentConfig;
};

