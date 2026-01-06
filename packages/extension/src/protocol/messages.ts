/**
 * Role: Message protocol types and validation for Webview <-> Extension communication
 * Responsibility: Define all message types, validate incoming messages, provide type guards
 * Invariant: All messages must have v (protocol version) and type fields
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

export type WebviewToExtensionMessage =
  | ReadyMessage
  | EditMessage
  | RequestResyncMessage
  | LogClientMessage;

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

const VALID_WEBVIEW_MESSAGE_TYPES = ['ready', 'edit', 'requestResync', 'logClient'] as const;

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
    if (typeof m.txId !== 'number') return false;
    if (typeof m.baseVersion !== 'number') return false;
    if (!Array.isArray(m.changes)) return false;
    for (const change of m.changes) {
      if (typeof change !== 'object' || change === null) return false;
      if (typeof change.start !== 'number') return false;
      if (typeof change.end !== 'number') return false;
      if (typeof change.text !== 'string') return false;
    }
  }

  if (m.type === 'logClient') {
    if (typeof m.level !== 'string') return false;
    if (typeof m.message !== 'string') return false;
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
  outcome: AckOutcome
): AckMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'ack',
    ts: Date.now(),
    origin: 'extension',
    txId,
    currentVersion,
    outcome,
  };
}

export function createNackMessage(
  txId: number,
  currentVersion: number,
  reason: NackReason,
  details?: string
): NackMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'nack',
    ts: Date.now(),
    origin: 'extension',
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
  fullContent?: string
): DocChangedMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'docChanged',
    ts: Date.now(),
    origin: 'extension',
    version,
    reason,
    changes,
    fullContent,
  };
}

export function createErrorMessage(
  code: ErrorCode,
  message: string,
  remediation: Remediation[]
): ErrorMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'error',
    ts: Date.now(),
    origin: 'extension',
    code,
    message,
    remediation,
  };
}
