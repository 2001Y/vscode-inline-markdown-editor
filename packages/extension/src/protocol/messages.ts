/**
 * 役割: Webview ⇄ Extension 間のメッセージプロトコル型定義とバリデーション
 * 責務: 全メッセージ型の定義、受信メッセージの検証、型ガード提供
 * 不変条件: 全メッセージは v (プロトコルバージョン) と type フィールドを必須とする
 * 
 * 設計書参照: 9.2-9.4 (メッセージプロトコル)
 * 
 * メッセージ例 (設計書 9.4):
 * 
 * ready (Webview → Extension):
 * { "v": 1, "type": "ready" }
 * 
 * edit (Webview → Extension):
 * {
 *   "v": 1, "type": "edit", "txId": 101, "baseVersion": 12,
 *   "changes": [{ "start": 120, "end": 125, "text": "abc" }]
 * }
 * 
 * ack (Extension → Webview):
 * { "v": 1, "type": "ack", "txId": 101, "currentVersion": 13, "outcome": "applied", "sessionId": "uuid" }
 * 
 * nack (Extension → Webview):
 * { "v": 1, "type": "nack", "txId": 101, "currentVersion": 13, "reason": "baseVersionMismatch", "sessionId": "uuid" }
 * 
 * docChanged (Extension → Webview):
 * { "v": 1, "type": "docChanged", "version": 13, "reason": "external", "changes": [...], "sessionId": "uuid" }
 * 
 * error (Extension → Webview):
 * { "v": 1, "type": "error", "code": "SYNC_TIMEOUT", "message": "...", "remediation": ["resetSession"], "sessionId": "uuid" }
 * 
 * Replace[] の例 (設計書 9.3):
 * - start/end は UTF-16 offset (VS Code の positionAt/offsetAt 互換)
 * - changes は互いに非重複、原則昇順
 * [{ "start": 0, "end": 5, "text": "Hello" }, { "start": 10, "end": 15, "text": "World" }]
 */

export const PROTOCOL_VERSION = 1;

export type MessageOrigin = 'webview' | 'extension';

export interface Replace {
  start: number;
  end: number;
  text: string;
}

export interface BaseMessage {
  v: number;
  type: string;
  ts?: number;
  origin?: MessageOrigin;
  sessionId?: string;
  clientId?: string;
  docUri?: string;
}

export interface ReadyMessage extends BaseMessage {
  type: 'ready';
}

export interface EditMessage extends BaseMessage {
  type: 'edit';
  txId: number;
  baseVersion: number;
  changes: Replace[];
}

export interface RequestResyncMessage extends BaseMessage {
  type: 'requestResync';
}

export interface LogClientMessage extends BaseMessage {
  type: 'logClient';
  level: 'INFO' | 'DEBUG' | 'TRACE' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
}

export interface OpenLinkMessage extends BaseMessage {
  type: 'openLink';
  url: string;
}

export interface CopyToClipboardMessage extends BaseMessage {
  type: 'copyToClipboard';
  text: string;
}

export interface OverwriteSaveMessage extends BaseMessage {
  type: 'overwriteSave';
  content: string;
}

export interface ResolveImageMessage extends BaseMessage {
  type: 'resolveImage';
  requestId: string;
  src: string;
}

export interface ReopenWithTextEditorMessage extends BaseMessage {
  type: 'reopenWithTextEditor';
}

export interface ExportLogsMessage extends BaseMessage {
  type: 'exportLogs';
}

export interface RequestResyncWithConfirmMessage extends BaseMessage {
  type: 'requestResyncWithConfirm';
}

export interface OverwriteSaveWithConfirmMessage extends BaseMessage {
  type: 'overwriteSaveWithConfirm';
  content: string;
}

export type WebviewToExtensionMessage =
  | ReadyMessage
  | EditMessage
  | RequestResyncMessage
  | LogClientMessage
  | OpenLinkMessage
  | CopyToClipboardMessage
  | OverwriteSaveMessage
  | ResolveImageMessage
  | ReopenWithTextEditorMessage
  | ExportLogsMessage
  | RequestResyncWithConfirmMessage
  | OverwriteSaveWithConfirmMessage;

export interface InitMessage extends BaseMessage {
  type: 'init';
  version: number;
  content: string;
  sessionId: string;
  clientId: string;
  locale: string;
  i18n: Record<string, string>;
  config: WebviewConfig;
}

export interface WebviewConfig {
  debounceMs: number;
  timeoutMs: number;
  changeGuard: {
    maxChangedRatio: number;
    maxChangedChars: number;
    maxHunks: number;
  };
  security: {
    allowWorkspaceImages: boolean;
    allowRemoteImages: boolean;
    allowInsecureRemoteImages: boolean;
    renderHtml: boolean;
    confirmExternalLinks: boolean;
  };
  debug: {
    logging: boolean;
    logLevel: string;
  };
}

export type AckOutcome = 'applied' | 'noop';

export interface AckMessage extends BaseMessage {
  type: 'ack';
  txId: number;
  currentVersion: number;
  outcome: AckOutcome;
}

export type NackReason = 'baseVersionMismatch' | 'applyFailed' | 'unknown';

export interface NackMessage extends BaseMessage {
  type: 'nack';
  txId: number;
  currentVersion: number;
  reason: NackReason;
  details?: string;
}

export interface DocChangedMessage extends BaseMessage {
  type: 'docChanged';
  version: number;
  reason: 'self' | 'external' | 'undo' | 'redo';
  changes: Replace[];
  fullContent?: string;
}

export type ErrorCode =
  | 'SYNC_TIMEOUT'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'CODEC_PARSE_FAILED'
  | 'CODEC_SERIALIZE_FAILED'
  | 'APPLY_EDIT_FAILED'
  | 'DIFF_ENGINE_FAILED'
  | 'CHANGE_GUARD_EXCEEDED'
  | 'WORKSPACE_UNTRUSTED'
  | 'SETTINGS_NOT_CONFIGURED'
  | 'UNKNOWN';

export type Remediation =
  | 'resetSession'
  | 'reopenWithTextEditor'
  | 'resync'
  | 'applySettings'
  | 'trustWorkspace';

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
  remediation: Remediation[];
}

export type ExtensionToWebviewMessage =
  | InitMessage
  | AckMessage
  | NackMessage
  | DocChangedMessage
  | ErrorMessage;

const VALID_WEBVIEW_MESSAGE_TYPES = ['ready', 'edit', 'requestResync', 'logClient', 'openLink', 'copyToClipboard', 'overwriteSave', 'resolveImage', 'reopenWithTextEditor', 'exportLogs', 'requestResyncWithConfirm', 'overwriteSaveWithConfirm'] as const;

export function isValidWebviewMessage(msg: unknown): msg is WebviewToExtensionMessage {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }

  const m = msg as Record<string, unknown>;

  if (typeof m.v !== 'number' || m.v !== PROTOCOL_VERSION) {
    return false;
  }

  if (typeof m.type !== 'string') {
    return false;
  }

  if (!VALID_WEBVIEW_MESSAGE_TYPES.includes(m.type as typeof VALID_WEBVIEW_MESSAGE_TYPES[number])) {
    return false;
  }

  if (m.type === 'edit') {
    if (typeof m.txId !== 'number') {return false;}
    if (typeof m.baseVersion !== 'number') {return false;}
    if (!Array.isArray(m.changes)) {return false;}
    for (const change of m.changes) {
      if (typeof change !== 'object' || change === null) {return false;}
      if (typeof change.start !== 'number') {return false;}
      if (typeof change.end !== 'number') {return false;}
      if (typeof change.text !== 'string') {return false;}
    }
  }

  if (m.type === 'logClient') {
    if (typeof m.level !== 'string') {return false;}
    if (typeof m.message !== 'string') {return false;}
  }

  return true;
}

export function createInitMessage(
  version: number,
  content: string,
  sessionId: string,
  clientId: string,
  locale: string,
  i18n: Record<string, string>,
  config: WebviewConfig
): InitMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'init',
    ts: Date.now(),
    origin: 'extension',
    version,
    content,
    sessionId,
    clientId,
    locale,
    i18n,
    config,
  };
}

export function createAckMessage(
  txId: number,
  currentVersion: number,
  outcome: AckOutcome,
  sessionId: string
): AckMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'ack',
    ts: Date.now(),
    origin: 'extension',
    sessionId,
    txId,
    currentVersion,
    outcome,
  };
}

export function createNackMessage(
  txId: number,
  currentVersion: number,
  reason: NackReason,
  sessionId: string,
  details?: string
): NackMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'nack',
    ts: Date.now(),
    origin: 'extension',
    sessionId,
    txId,
    currentVersion,
    reason,
    details,
  };
}

export function createDocChangedMessage(
  version: number,
  reason: DocChangedMessage['reason'],
  changes: Replace[],
  sessionId: string,
  fullContent?: string
): DocChangedMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'docChanged',
    ts: Date.now(),
    origin: 'extension',
    sessionId,
    version,
    reason,
    changes,
    fullContent,
  };
}

export function createErrorMessage(
  code: ErrorCode,
  message: string,
  remediation: Remediation[],
  sessionId?: string
): ErrorMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'error',
    ts: Date.now(),
    origin: 'extension',
    sessionId,
    code,
    message,
    remediation,
  };
}
