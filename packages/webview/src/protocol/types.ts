/**
 * Role: Protocol types for Webview <-> Extension communication
 * Responsibility: Define message types used by the Webview
 * Invariant: Must match the extension's protocol/messages.ts types
 */

export const PROTOCOL_VERSION = 1;

export interface Replace {
  start: number;
  end: number;
  text: string;
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

export interface InitMessage {
  v: number;
  type: 'init';
  version: number;
  content: string;
  sessionId: string;
  clientId: string;
  locale: string;
  i18n: Record<string, string>;
  config: WebviewConfig;
}

export type AckOutcome = 'applied' | 'noop';

export interface AckMessage {
  v: number;
  type: 'ack';
  txId: number;
  currentVersion: number;
  outcome: AckOutcome;
}

export type NackReason = 'baseVersionMismatch' | 'applyFailed' | 'unknown';

export interface NackMessage {
  v: number;
  type: 'nack';
  txId: number;
  currentVersion: number;
  reason: NackReason;
  details?: string;
}

export interface DocChangedMessage {
  v: number;
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

export interface ErrorMessage {
  v: number;
  type: 'error';
  code: ErrorCode;
  message: string;
  remediation: Remediation[];
}

export interface ImageResolvedMessage {
  type: 'imageResolved';
  requestId: string;
  resolvedSrc: string;
}

export type ExtensionToWebviewMessage =
  | InitMessage
  | AckMessage
  | NackMessage
  | DocChangedMessage
  | ErrorMessage
  | ImageResolvedMessage;

export interface ReadyMessage {
  v: number;
  type: 'ready';
}

export interface EditMessage {
  v: number;
  type: 'edit';
  txId: number;
  baseVersion: number;
  changes: Replace[];
}

export interface RequestResyncMessage {
  v: number;
  type: 'requestResync';
}

export interface LogClientMessage {
  v: number;
  type: 'logClient';
  level: 'INFO' | 'DEBUG' | 'TRACE' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
}

export interface OpenLinkMessage {
  v: number;
  type: 'openLink';
  url: string;
}

export interface CopyToClipboardMessage {
  v: number;
  type: 'copyToClipboard';
  text: string;
}

export interface OverwriteSaveMessage {
  v: number;
  type: 'overwriteSave';
  content: string;
}

export interface ResolveImageMessage {
  v: number;
  type: 'resolveImage';
  requestId: string;
  src: string;
}

export interface ReopenWithTextEditorMessage {
  v: number;
  type: 'reopenWithTextEditor';
}

export interface ExportLogsMessage {
  v: number;
  type: 'exportLogs';
}

export interface RequestResyncWithConfirmMessage {
  v: number;
  type: 'requestResyncWithConfirm';
}

export interface OverwriteSaveWithConfirmMessage {
  v: number;
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

export function createReadyMessage(): ReadyMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'ready',
  };
}

export function createEditMessage(
  txId: number,
  baseVersion: number,
  changes: Replace[]
): EditMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'edit',
    txId,
    baseVersion,
    changes,
  };
}

export function createRequestResyncMessage(): RequestResyncMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'requestResync',
  };
}

export function createLogClientMessage(
  level: LogClientMessage['level'],
  message: string,
  details?: Record<string, unknown>
): LogClientMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'logClient',
    level,
    message,
    details,
  };
}

export function createOpenLinkMessage(url: string): OpenLinkMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'openLink',
    url,
  };
}

export function createCopyToClipboardMessage(text: string): CopyToClipboardMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'copyToClipboard',
    text,
  };
}

export function createOverwriteSaveMessage(content: string): OverwriteSaveMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'overwriteSave',
    content,
  };
}

export function createResolveImageMessage(requestId: string, src: string): ResolveImageMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'resolveImage',
    requestId,
    src,
  };
}

export function createReopenWithTextEditorMessage(): ReopenWithTextEditorMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'reopenWithTextEditor',
  };
}

export function createExportLogsMessage(): ExportLogsMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'exportLogs',
  };
}

export function createRequestResyncWithConfirmMessage(): RequestResyncWithConfirmMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'requestResyncWithConfirm',
  };
}

export function createOverwriteSaveWithConfirmMessage(content: string): OverwriteSaveWithConfirmMessage {
  return {
    v: PROTOCOL_VERSION,
    type: 'overwriteSaveWithConfirm',
    content,
  };
}
