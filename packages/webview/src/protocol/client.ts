/**
 * Role: Sync client for Webview <-> Extension communication
 * Responsibility: Handle message passing, manage in-flight edits, debounce, timeout
 * Invariant: Only one in-flight edit at a time; coalesce pending edits
 */

import {
  type ExtensionToWebviewMessage,
  type WebviewConfig,
  type Replace,
  createReadyMessage,
  createEditMessage,
  createRequestResyncMessage,
  createLogClientMessage,
  PROTOCOL_VERSION,
} from './types.js';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncClientCallbacks {
  onInit: (content: string, version: number, config: WebviewConfig, i18n: Record<string, string>) => void;
  onDocChanged: (version: number, changes: Replace[], fullContent?: string) => void;
  onError: (code: string, message: string, remediation: string[]) => void;
  onSyncStateChange: (state: SyncState) => void;
}

export class SyncClient {
  private vscode: VsCodeApi;
  private callbacks: SyncClientCallbacks;
  private config: WebviewConfig | null = null;
  private i18n: Record<string, string> = {};

  private sessionId: string | null = null;
  private clientId: string | null = null;
  private baseVersion = 0;
  private shadowText = '';

  private txIdCounter = 0;
  private inFlightTxId: number | null = null;
  private inFlightTimeout: ReturnType<typeof setTimeout> | null = null;
  private coalescePending = false;
  private pendingChanges: Replace[] = [];

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingRemote = false;

  constructor(callbacks: SyncClientCallbacks) {
    this.vscode = acquireVsCodeApi();
    this.callbacks = callbacks;

    window.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  start(): void {
    this.vscode.postMessage(createReadyMessage());
    this.log('DEBUG', 'Ready message sent');
  }

  private handleMessage(msg: ExtensionToWebviewMessage): void {
    if (msg.v !== PROTOCOL_VERSION) {
      this.callbacks.onError(
        'PROTOCOL_VERSION_MISMATCH',
        `Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${msg.v}`,
        ['resetSession']
      );
      return;
    }

    switch (msg.type) {
      case 'init':
        this.handleInit(msg);
        break;
      case 'ack':
        this.handleAck(msg);
        break;
      case 'nack':
        this.handleNack(msg);
        break;
      case 'docChanged':
        this.handleDocChanged(msg);
        break;
      case 'error':
        this.callbacks.onError(msg.code, msg.message, msg.remediation);
        break;
    }
  }

  private handleInit(msg: ExtensionToWebviewMessage & { type: 'init' }): void {
    this.sessionId = msg.sessionId;
    this.clientId = msg.clientId;
    this.baseVersion = msg.version;
    this.shadowText = msg.content;
    this.config = msg.config;
    this.i18n = msg.i18n;

    this.inFlightTxId = null;
    this.coalescePending = false;
    this.pendingChanges = [];
    this.clearInFlightTimeout();

    this.callbacks.onInit(msg.content, msg.version, msg.config, msg.i18n);
    this.callbacks.onSyncStateChange('idle');

    this.log('INFO', 'Initialized', {
      sessionId: this.sessionId,
      clientId: this.clientId,
      version: msg.version,
    });
  }

  private handleAck(msg: ExtensionToWebviewMessage & { type: 'ack' }): void {
    if (msg.txId !== this.inFlightTxId) {
      this.log('WARN', 'Received ack for unknown txId', { txId: msg.txId, inFlightTxId: this.inFlightTxId });
      return;
    }

    this.clearInFlightTimeout();
    this.inFlightTxId = null;
    this.baseVersion = msg.currentVersion;

    this.log('DEBUG', 'Ack received', { txId: msg.txId, outcome: msg.outcome, version: msg.currentVersion });

    if (this.coalescePending) {
      this.coalescePending = false;
      this.flushPendingChanges();
    } else {
      this.callbacks.onSyncStateChange('idle');
    }
  }

  private handleNack(msg: ExtensionToWebviewMessage & { type: 'nack' }): void {
    if (msg.txId !== this.inFlightTxId) {
      this.log('WARN', 'Received nack for unknown txId', { txId: msg.txId, inFlightTxId: this.inFlightTxId });
      return;
    }

    this.clearInFlightTimeout();
    this.inFlightTxId = null;

    this.log('WARN', 'Nack received', { txId: msg.txId, reason: msg.reason, version: msg.currentVersion });

    if (msg.reason === 'baseVersionMismatch') {
      this.requestResync();
    } else {
      this.callbacks.onError('APPLY_EDIT_FAILED', msg.details || 'Edit failed', ['resync']);
    }
  }

  private handleDocChanged(msg: ExtensionToWebviewMessage & { type: 'docChanged' }): void {
    this.applyingRemote = true;

    try {
      this.baseVersion = msg.version;

      if (msg.fullContent !== undefined) {
        this.shadowText = msg.fullContent;
        this.callbacks.onDocChanged(msg.version, [], msg.fullContent);
      } else {
        for (const change of msg.changes) {
          this.shadowText =
            this.shadowText.slice(0, change.start) +
            change.text +
            this.shadowText.slice(change.end);
        }
        this.callbacks.onDocChanged(msg.version, msg.changes);
      }

      this.log('DEBUG', 'DocChanged applied', {
        version: msg.version,
        reason: msg.reason,
        changesCount: msg.changes.length,
        hasFullContent: msg.fullContent !== undefined,
      });
    } finally {
      this.applyingRemote = false;
    }
  }

  isApplyingRemote(): boolean {
    return this.applyingRemote;
  }

  scheduleEdit(getChanges: () => Replace[]): void {
    if (this.applyingRemote) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const debounceMs = this.config?.debounceMs ?? 250;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const changes = getChanges();
      this.queueEdit(changes);
    }, debounceMs);
  }

  private queueEdit(changes: Replace[]): void {
    if (changes.length === 0) {
      return;
    }

    if (this.inFlightTxId !== null) {
      this.coalescePending = true;
      this.pendingChanges = changes;
      this.log('DEBUG', 'Edit coalesced', { changesCount: changes.length });
      return;
    }

    this.sendEdit(changes);
  }

  private sendEdit(changes: Replace[]): void {
    const txId = ++this.txIdCounter;
    this.inFlightTxId = txId;

    const msg = createEditMessage(txId, this.baseVersion, changes);
    this.vscode.postMessage(msg);

    this.callbacks.onSyncStateChange('syncing');

    const timeoutMs = this.config?.timeoutMs ?? 3000;
    this.inFlightTimeout = setTimeout(() => {
      this.handleTimeout(txId);
    }, timeoutMs);

    this.log('DEBUG', 'Edit sent', { txId, baseVersion: this.baseVersion, changesCount: changes.length });
  }

  private flushPendingChanges(): void {
    if (this.pendingChanges.length > 0) {
      const changes = this.pendingChanges;
      this.pendingChanges = [];
      this.sendEdit(changes);
    } else {
      this.callbacks.onSyncStateChange('idle');
    }
  }

  private handleTimeout(txId: number): void {
    if (this.inFlightTxId !== txId) {
      return;
    }

    this.log('ERROR', 'Sync timeout', { txId });
    this.inFlightTxId = null;
    this.callbacks.onSyncStateChange('error');
    this.callbacks.onError('SYNC_TIMEOUT', 'Sync timeout', ['resync', 'resetSession']);
  }

  private clearInFlightTimeout(): void {
    if (this.inFlightTimeout) {
      clearTimeout(this.inFlightTimeout);
      this.inFlightTimeout = null;
    }
  }

  requestResync(): void {
    this.clearInFlightTimeout();
    this.inFlightTxId = null;
    this.coalescePending = false;
    this.pendingChanges = [];

    this.vscode.postMessage(createRequestResyncMessage());
    this.callbacks.onSyncStateChange('syncing');

    this.log('INFO', 'Resync requested');
  }

  getShadowText(): string {
    return this.shadowText;
  }

  updateShadowText(text: string): void {
    this.shadowText = text;
  }

  getBaseVersion(): number {
    return this.baseVersion;
  }

  getConfig(): WebviewConfig | null {
    return this.config;
  }

  getI18n(): Record<string, string> {
    return this.i18n;
  }

  t(key: string, ...args: (string | number)[]): string {
    let text = this.i18n[key] || key;
    args.forEach((arg, index) => {
      text = text.replace(`{${index}}`, String(arg));
    });
    return text;
  }

  saveState(state: unknown): void {
    this.vscode.setState(state);
  }

  loadState<T>(): T | undefined {
    return this.vscode.getState() as T | undefined;
  }

  private log(
    level: 'INFO' | 'DEBUG' | 'TRACE' | 'WARN' | 'ERROR',
    message: string,
    details?: Record<string, unknown>
  ): void {
    if (!this.config?.debug.logging) {
      return;
    }

    const configLevel = this.config.debug.logLevel;
    const levels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
    const msgLevelIndex = levels.indexOf(level);
    const configLevelIndex = levels.indexOf(configLevel);

    if (msgLevelIndex < configLevelIndex) {
      return;
    }

    console.log(`[${level}] ${message}`, details);

    this.vscode.postMessage(createLogClientMessage(level, message, details));
  }
}
