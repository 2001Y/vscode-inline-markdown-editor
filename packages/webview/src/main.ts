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
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    console.error('App container not found');
    return;
  }

  const editorContainer = document.createElement('div');
  editorContainer.className = 'editor-container';
  appContainer.appendChild(editorContainer);

  errorOverlay = createErrorOverlay(appContainer);
  syncIndicator = createSyncIndicator(appContainer);

  syncClient = new SyncClient({
    onInit: handleInit,
    onDocChanged: handleDocChanged,
    onError: handleError,
    onSyncStateChange: handleSyncStateChange,
  });

  syncClient.start();
}

function handleInit(
  content: string,
  _version: number,
  config: WebviewConfig,
  _i18n: Record<string, string>
): void {
  const editorContainer = document.querySelector('.editor-container') as HTMLElement;
  if (!editorContainer) return;

  if (editorInstance) {
    editorInstance.destroy();
  }

  editorInstance = createEditor({
    container: editorContainer,
    syncClient: syncClient!,
    onChangeGuardExceeded: handleChangeGuardExceeded,
  });

  editorInstance.setContent(content);

  const savedState = syncClient?.loadState<AppState>();
  if (savedState?.scrollTop !== undefined) {
    editorContainer.scrollTop = savedState.scrollTop;
  }

  hideErrorOverlay();

  console.log('Editor initialized with config:', config);
}

function handleDocChanged(
  _version: number,
  changes: Replace[],
  fullContent?: string
): void {
  if (!editorInstance) return;

  if (fullContent !== undefined) {
    editorInstance.setContent(fullContent);
  } else if (changes.length > 0) {
    editorInstance.applyChanges(changes);
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

      switch (action) {
        case 'resync':
          button.textContent = syncClient.t('Resync');
          button.onclick = () => {
            syncClient?.requestResync();
            hideErrorOverlay();
          };
          break;
        case 'resetSession':
          button.textContent = syncClient.t('Reset Session');
          button.onclick = () => {
            syncClient?.requestResync();
            hideErrorOverlay();
          };
          break;
        case 'reopenWithTextEditor':
          button.textContent = syncClient.t('Reopen with Text Editor');
          button.onclick = () => {
            // This would need to be handled by the extension
          };
          break;
        default:
          button.textContent = action;
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
