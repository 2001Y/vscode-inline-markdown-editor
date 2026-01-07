/**
 * 役割: Webview ⇄ Extension 間の同期クライアント
 * 責務: メッセージパッシング、in-flight 編集管理、debounce、タイムアウト
 * 不変条件: in-flight は 1 件まで。複数編集は coalesce して待機
 * 
 * 設計書参照: 10 (同期アルゴリズム), 13.1 (sessionId フィルタリング)
 * 
 * 同期アルゴリズム (設計書 10):
 * - baseVersion: 最後に受信した docChanged/init の version
 * - txId: 送信ごとにインクリメント（クライアント内でユニーク）
 * - shadowText: 最後に同期した Markdown テキスト（差分計算の基準）
 * 
 * in-flight 管理 (設計書 10.1):
 * - 同時に送信できる edit は 1 件まで
 * - in-flight 中の編集は pendingChanges に coalesce
 * - ack 受信後に pendingChanges を送信
 * 
 * nack 後の自動再送 (設計書 10.2):
 * - baseVersionMismatch の場合、1 回だけ自動リトライ
 * - requestResync → docChanged 受信 → 保留していた edit を再送
 * - 2 回目の nack はエラー表示
 * 
 * タイムアウト (設計書 10.4):
 * - timeoutMs 以内に ack/nack が来なければ SYNC_TIMEOUT
 * - ErrorOverlay で復旧導線を表示
 * 
 * sessionId フィルタリング (設計書 13.1):
 * - init で受信した sessionId を保持
 * - 以降のメッセージは sessionId が一致しなければ破棄
 * - タブ復元時の古いメッセージ混入を防止
 * 
 * applyingRemote フラグ (設計書 9.5 ルール 3):
 * - docChanged 適用中は true
 * - この間は edit を送信しない（ループ防止）
 * 
 * メッセージ例:
 * 
 * edit 送信:
 * { "v": 1, "type": "edit", "txId": 101, "baseVersion": 12, "changes": [...] }
 * 
 * ack 受信:
 * { "v": 1, "type": "ack", "txId": 101, "currentVersion": 13, "outcome": "applied", "sessionId": "uuid" }
 * 
 * docChanged 受信:
 * { "v": 1, "type": "docChanged", "version": 14, "reason": "external", "changes": [...], "sessionId": "uuid" }
 */

import {
  type ExtensionToWebviewMessage,
  type WebviewConfig,
  type Replace,
  createReadyMessage,
  createEditMessage,
  createRequestResyncMessage,
  createLogClientMessage,
  createOpenLinkMessage,
  createCopyToClipboardMessage,
  createOverwriteSaveMessage,
  createReopenWithTextEditorMessage,
  createExportLogsMessage,
  createRequestResyncWithConfirmMessage,
  createOverwriteSaveWithConfirmMessage,
  createResolveImageMessage,
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
  onImageResolved?: (requestId: string, resolvedSrc: string) => void;
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
  private pendingRetry: { changes: Replace[]; baseVersion: number } | null = null;
  private retryCount = 0;
  private readonly MAX_RETRY_COUNT = 1;

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

    // Per spec 13.1: Filter messages by sessionId after init
    // Messages with different sessionId should be dropped to prevent stale message mix-in
    if (msg.type !== 'init' && this.sessionId !== null) {
      const msgSessionId = (msg as { sessionId?: string }).sessionId;
      if (msgSessionId !== undefined && msgSessionId !== this.sessionId) {
        this.log('WARN', 'Dropping message with mismatched sessionId', {
          expectedSessionId: this.sessionId,
          receivedSessionId: msgSessionId,
          messageType: msg.type
        });
        return;
      }
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
      case 'imageResolved':
        if (this.callbacks.onImageResolved) {
          this.callbacks.onImageResolved(msg.requestId, msg.resolvedSrc);
        }
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
    this.retryCount = 0;
    this.pendingRetry = null;

    this.log('DEBUG', 'Ack received', { 
      txId: msg.txId, 
      outcome: msg.outcome, 
      version: msg.currentVersion,
      coalescePending: this.coalescePending
    });

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

    this.log('WARN', 'Nack received', { 
      txId: msg.txId, 
      reason: msg.reason, 
      version: msg.currentVersion,
      retryCount: this.retryCount,
      maxRetry: this.MAX_RETRY_COUNT
    });

    if (msg.reason === 'baseVersionMismatch') {
      if (this.retryCount < this.MAX_RETRY_COUNT && this.pendingRetry) {
        this.log('INFO', 'Auto-retry after baseVersionMismatch - requesting resync first', {
          retryCount: this.retryCount,
          pendingChangesCount: this.pendingRetry.changes.length
        });
        this.retryCount++;
        this.requestResyncWithRetry();
      } else {
        this.log('INFO', 'Max retry exceeded or no pending retry - requesting resync without retry', {
          retryCount: this.retryCount,
          hasPendingRetry: !!this.pendingRetry
        });
        this.retryCount = 0;
        this.pendingRetry = null;
        this.requestResync();
      }
    } else {
      this.retryCount = 0;
      this.pendingRetry = null;
      this.callbacks.onError('APPLY_EDIT_FAILED', msg.details || 'Edit failed', ['resync']);
    }
  }

  private requestResyncWithRetry(): void {
    this.clearInFlightTimeout();
    this.inFlightTxId = null;
    this.coalescePending = false;

    this.vscode.postMessage(createRequestResyncMessage());
    this.callbacks.onSyncStateChange('syncing');

    this.log('INFO', 'Resync requested with pending retry');
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
        hasPendingRetry: !!this.pendingRetry,
        retryCount: this.retryCount,
      });

      if (this.pendingRetry && this.retryCount > 0) {
        this.log('INFO', 'Executing auto-retry after resync', {
          retryCount: this.retryCount,
          pendingChangesCount: this.pendingRetry.changes.length,
          newBaseVersion: this.baseVersion
        });
        const retryChanges = this.pendingRetry.changes;
        this.pendingRetry = null;
        setTimeout(() => {
          this.sendEdit(retryChanges);
        }, 50);
      }
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

    this.pendingRetry = { changes, baseVersion: this.baseVersion };

    const msg = createEditMessage(txId, this.baseVersion, changes);
    this.vscode.postMessage(msg);

    this.callbacks.onSyncStateChange('syncing');

    const timeoutMs = this.config?.timeoutMs ?? 3000;
    this.inFlightTimeout = setTimeout(() => {
      this.handleTimeout(txId);
    }, timeoutMs);

    this.log('DEBUG', 'Edit sent', { 
      txId, 
      baseVersion: this.baseVersion, 
      changesCount: changes.length,
      retryCount: this.retryCount
    });
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

  openLink(url: string): void {
    this.log('INFO', 'Opening link', { url });
    this.vscode.postMessage(createOpenLinkMessage(url));
  }

  copyToClipboard(text: string): void {
    this.log('INFO', 'Copying to clipboard', { textLength: text.length });
    this.vscode.postMessage(createCopyToClipboardMessage(text));
  }

  overwriteSave(content: string): void {
    this.log('INFO', 'Overwrite save requested', { contentLength: content.length });
    this.vscode.postMessage(createOverwriteSaveMessage(content));
  }

  reopenWithTextEditor(): void {
    this.log('INFO', 'Reopen with text editor requested');
    this.vscode.postMessage(createReopenWithTextEditorMessage());
  }

  exportLogs(): void {
    this.log('INFO', 'Export logs requested');
    this.vscode.postMessage(createExportLogsMessage());
  }

  requestResyncWithConfirm(): void {
    this.log('INFO', 'Resync with confirmation requested');
    this.vscode.postMessage(createRequestResyncWithConfirmMessage());
  }

  overwriteSaveWithConfirm(content: string): void {
    this.log('INFO', 'Overwrite save with confirmation requested', { contentLength: content.length });
    this.vscode.postMessage(createOverwriteSaveWithConfirmMessage(content));
  }

  resolveImage(requestId: string, src: string): void {
    this.log('DEBUG', 'Resolving image', { requestId, src });
    this.vscode.postMessage(createResolveImageMessage(requestId, src));
  }

  getCurrentContent(): string {
    return this.shadowText;
  }

  resetSession(): void {
    this.log('INFO', 'Reset session requested');
    // Clear all state and request fresh init
    this.clearInFlightTimeout();
    this.inFlightTxId = null;
    this.coalescePending = false;
    this.pendingChanges = [];
    this.pendingRetry = null;
    this.retryCount = 0;
    this.baseVersion = 0;
    this.shadowText = '';
    // Send ready message to trigger fresh init from extension
    this.vscode.postMessage(createReadyMessage());
    this.callbacks.onSyncStateChange('syncing');
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
