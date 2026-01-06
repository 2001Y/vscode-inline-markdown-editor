/**
 * Role: Webview entry point
 * Responsibility: Initialize VS Code API, start sync client, mount editor
 * Invariant: acquireVsCodeApi() must be called only once and kept in module scope
 */

import { SyncClient, type SyncState } from './protocol/client.js';
import { createEditor, type EditorInstance } from './editor/createEditor.js';
import type { Replace, WebviewConfig } from './protocol/types.js';
import type { ChangeMetrics } from './editor/diffEngine.js';
import './styles.css';

interface AppState {
  scrollTop?: number;
  scrollLeft?: number;
}

let editorInstance: EditorInstance | null = null;
let syncClient: SyncClient | null = null;
let errorOverlay: HTMLElement | null = null;
let syncIndicator: HTMLElement | null = null;

function main(): void {
  console.log('[Main] Webview main() starting');
  
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    console.error('[Main] App container not found - fatal error');
    return;
  }

  console.log('[Main] Creating editor container');
  const editorContainer = document.createElement('div');
  editorContainer.className = 'editor-container';
  appContainer.appendChild(editorContainer);

  console.log('[Main] Creating error overlay and sync indicator');
  errorOverlay = createErrorOverlay(appContainer);
  syncIndicator = createSyncIndicator(appContainer);

  console.log('[Main] Creating SyncClient');
  syncClient = new SyncClient({
    onInit: handleInit,
    onDocChanged: handleDocChanged,
    onError: handleError,
    onSyncStateChange: handleSyncStateChange,
  });

  console.log('[Main] Starting SyncClient');
  syncClient.start();
  console.log('[Main] Webview initialization complete');
}

function handleInit(
  content: string,
  _version: number,
  config: WebviewConfig,
  _i18n: Record<string, string>
): void {
  console.log('[handleInit] Init received', { 
    contentLength: content.length, 
    version: _version,
    configDebugLogging: config.debug.logging,
    configDebugLogLevel: config.debug.logLevel
  });

  const editorContainer = document.querySelector('.editor-container') as HTMLElement;
  if (!editorContainer) {
    console.error('[handleInit] Editor container not found - fatal error');
    return;
  }

  if (editorInstance) {
    console.log('[handleInit] Destroying existing editor instance');
    editorInstance.destroy();
  }

  console.log('[handleInit] Creating new editor instance');
  editorInstance = createEditor({
    container: editorContainer,
    syncClient: syncClient!,
    onChangeGuardExceeded: handleChangeGuardExceeded,
  });

  console.log('[handleInit] Setting editor content');
  editorInstance.setContent(content);

  const savedState = syncClient?.loadState<AppState>();
  if (savedState?.scrollTop !== undefined) {
    console.log('[handleInit] Restoring scroll position', { scrollTop: savedState.scrollTop });
    editorContainer.scrollTop = savedState.scrollTop;
  }

  hideErrorOverlay();

  console.log('[handleInit] Editor initialization complete', { 
    contentLength: content.length,
    version: _version
  });
}

function handleDocChanged(
  _version: number,
  changes: Replace[],
  fullContent?: string
): void {
  console.log('[handleDocChanged] DocChanged received', { 
    version: _version, 
    changesCount: changes.length, 
    hasFullContent: fullContent !== undefined,
    fullContentLength: fullContent?.length
  });

  if (!editorInstance) {
    console.warn('[handleDocChanged] No editor instance - ignoring docChanged');
    return;
  }

  if (fullContent !== undefined) {
    console.log('[handleDocChanged] Applying full content replacement', { contentLength: fullContent.length });
    editorInstance.setContent(fullContent);
  } else if (changes.length > 0) {
    console.log('[handleDocChanged] Applying incremental changes', { changesCount: changes.length });
    editorInstance.applyChanges(changes);
  } else {
    console.log('[handleDocChanged] No changes to apply');
  }
}

function handleError(code: string, message: string, remediation: string[]): void {
  console.error('Error:', code, message);
  showErrorOverlay(code, message, remediation);
}

function handleSyncStateChange(state: SyncState): void {
  updateSyncIndicator(state);
}

function handleChangeGuardExceeded(metrics: ChangeMetrics): void {
  const message = syncClient?.t(
    'Large change detected. {0} characters changed ({1}%).',
    metrics.changedChars,
    Math.round(metrics.changedRatio * 100)
  ) || `Large change detected. ${metrics.changedChars} characters changed (${Math.round(metrics.changedRatio * 100)}%).`;

  showErrorOverlay('CHANGE_GUARD_EXCEEDED', message, ['resync', 'resetSession']);
}

function createErrorOverlay(parent: HTMLElement): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'error-overlay hidden';
  overlay.innerHTML = `
    <div class="error-content">
      <div class="error-icon">!</div>
      <div class="error-code"></div>
      <div class="error-message"></div>
      <div class="error-actions"></div>
    </div>
  `;
  parent.appendChild(overlay);
  return overlay;
}

function showErrorOverlay(code: string, message: string, remediation: string[]): void {
  if (!errorOverlay || !syncClient) return;

  console.log('[ErrorOverlay] Showing error overlay', { code, message, remediation });

  const codeEl = errorOverlay.querySelector('.error-code');
  const messageEl = errorOverlay.querySelector('.error-message');
  const actionsEl = errorOverlay.querySelector('.error-actions');

  if (codeEl) codeEl.textContent = code;
  if (messageEl) messageEl.textContent = message;

  if (actionsEl) {
    actionsEl.innerHTML = '';

    for (const action of remediation) {
      const button = document.createElement('button');
      button.className = 'error-action-button';

      console.log('[ErrorOverlay] Adding action button', { action });

      switch (action) {
        case 'resync':
          button.textContent = syncClient.t('Resync');
          button.onclick = () => {
            console.log('[ErrorOverlay] Resync clicked - requesting confirmation');
            syncClient?.requestResyncWithConfirm();
          };
          break;
        case 'resetSession':
          button.textContent = syncClient.t('Reset Session');
          button.onclick = () => {
            console.log('[ErrorOverlay] Reset Session clicked - requesting confirmation');
            syncClient?.requestResyncWithConfirm();
          };
          break;
        case 'reopenWithTextEditor':
          button.textContent = syncClient.t('Reopen with Text Editor');
          button.onclick = () => {
            console.log('[ErrorOverlay] Reopen with Text Editor clicked');
            syncClient?.reopenWithTextEditor();
          };
          break;
        case 'copyContent':
          button.textContent = syncClient.t('Copy Content');
          button.onclick = () => {
            console.log('[ErrorOverlay] Copy Content clicked');
            const content = editorInstance?.getContent() || syncClient?.getCurrentContent() || '';
            syncClient?.copyToClipboard(content);
          };
          break;
        case 'overwriteSave':
          button.textContent = syncClient.t('Overwrite Save');
          button.onclick = () => {
            console.log('[ErrorOverlay] Overwrite Save clicked - requesting confirmation');
            const content = editorInstance?.getContent() || syncClient?.getCurrentContent() || '';
            syncClient?.overwriteSaveWithConfirm(content);
          };
          break;
        case 'exportLogs':
          button.textContent = syncClient.t('Export Logs');
          button.onclick = () => {
            console.log('[ErrorOverlay] Export Logs clicked');
            syncClient?.exportLogs();
          };
          break;
        default:
          button.textContent = action;
          console.log('[ErrorOverlay] Unknown action', { action });
      }

      actionsEl.appendChild(button);
    }
  }

  errorOverlay.classList.remove('hidden');
}

function hideErrorOverlay(): void {
  if (errorOverlay) {
    errorOverlay.classList.add('hidden');
  }
}

function createSyncIndicator(parent: HTMLElement): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'sync-indicator idle';
  indicator.innerHTML = '<span class="sync-dot"></span>';
  parent.appendChild(indicator);
  return indicator;
}

function updateSyncIndicator(state: SyncState): void {
  if (!syncIndicator) return;

  syncIndicator.classList.remove('idle', 'syncing', 'error');
  syncIndicator.classList.add(state);
}

window.addEventListener('beforeunload', () => {
  if (syncClient) {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement;
    if (editorContainer) {
      syncClient.saveState({
        scrollTop: editorContainer.scrollTop,
        scrollLeft: editorContainer.scrollLeft,
      });
    }
  }
});

main();
