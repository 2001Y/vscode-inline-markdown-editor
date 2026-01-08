/**
 * 役割: Webview のエントリーポイント
 * 責務: VS Code API 初期化、SyncClient 起動、エディタマウント
 * 不変条件: acquireVsCodeApi() はモジュールスコープで一度だけ呼び出すこと
 * 
 * 設計書参照: 6.3, 12.1 (Webview の責務)
 * 
 * Webview ライフサイクル (設計書 13):
 * 1. main() 実行 → SyncClient 生成 → ready 送信
 * 2. Extension から init 受信 → エディタ初期化
 * 3. 編集 → SyncClient.scheduleEdit() → debounce 後に edit 送信
 * 4. ack/nack 受信 → 状態更新
 * 5. docChanged 受信 → エディタに差分適用
 * 6. beforeunload → getState/setState でスクロール位置保存
 *
 * NOTE:
 * エラー/警告（例: ChangeGuard 超過）は Webview 内オーバーレイではなく
 * VS Code 標準の通知 UI で表示する（追加方針）。
 * 
 * SyncIndicator:
 * - idle: 同期完了
 * - syncing: 送信中/待機中
 * - error: エラー発生
 * 
 * 状態永続化 (設計書 13.2):
 * - getState/setState でスクロール位置を保存
 * - タブ切り替え/リロード後も位置を復元
 */

import { SyncClient, type SyncState } from './protocol/client.js';
import { createEditor, type EditorInstance } from './editor/createEditor.js';
import type { Replace, Remediation, WebviewConfig } from './protocol/types.js';
import type { ChangeMetrics } from './editor/diffEngine.js';
import './styles.css';

interface AppState {
  scrollTop?: number;
  scrollLeft?: number;
}

let editorInstance: EditorInstance | null = null;
let syncClient: SyncClient | null = null;
let syncIndicator: HTMLElement | null = null;
let editorContainerEl: HTMLElement | null = null;

// Image resolution state (workspace relative paths -> webview URIs)
const pendingImageRequestsById = new Map<string, string>(); // requestId -> originalSrc
const pendingImageRequestsBySrc = new Map<string, string>(); // originalSrc -> requestId
const resolvedImageCache = new Map<string, string>(); // originalSrc -> resolvedSrc
let imageObserver: MutationObserver | null = null;

function main(): void {
  console.log('[Main] Webview main() starting');
  
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    console.error('[Main] App container not found - fatal error');
    return;
  }

  console.log('[Main] Creating editor container');
  editorContainerEl = document.createElement('div');
  editorContainerEl.className = 'editor-container';
  appContainer.appendChild(editorContainerEl);

  console.log('[Main] Creating sync indicator');
  syncIndicator = createSyncIndicator(appContainer);

  console.log('[Main] Creating SyncClient');
  syncClient = new SyncClient({
    onInit: handleInit,
    onDocChanged: handleDocChanged,
    onError: handleError,
    onSyncStateChange: handleSyncStateChange,
    onImageResolved: handleImageResolved,
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
    configDebugEnabled: config.debug.enabled
  });

  if (!editorContainerEl) {
    console.error('[handleInit] Editor container not found - fatal error');
    return;
  }

  if (editorInstance) {
    console.log('[handleInit] Destroying existing editor instance');
    editorInstance.destroy();
  }

  console.log('[handleInit] Creating new editor instance');
  editorInstance = createEditor({
    container: editorContainerEl,
    syncClient: syncClient!,
    onChangeGuardExceeded: handleChangeGuardExceeded,
  });

  console.log('[handleInit] Setting editor content');
  editorInstance.setContent(content);
  resolveImagesInEditor();
  setupImageObserver();

  const savedState = syncClient?.loadState<AppState>();
  if (savedState?.scrollTop !== undefined) {
    console.log('[handleInit] Restoring scroll position', { scrollTop: savedState.scrollTop });
    editorContainerEl.scrollTop = savedState.scrollTop;
  }

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
    resolveImagesInEditor();
  } else if (changes.length > 0) {
    console.log('[handleDocChanged] Applying incremental changes', { changesCount: changes.length });
    editorInstance.applyChanges(changes);
    resolveImagesInEditor();
  } else {
    console.log('[handleDocChanged] No changes to apply');
  }
}

function handleError(code: string, message: string, remediation: string[]): void {
  console.error('Error:', code, message);
  // Surface via VS Code native notifications (host)
  syncClient?.notifyHost('ERROR', code, message, filterRemediations(remediation));
}

function handleSyncStateChange(state: SyncState): void {
  updateSyncIndicator(state);
}

// ChangeGuard: 大規模編集の警告ロジック（一時的にコメントアウト）
// function handleChangeGuardExceeded(metrics: ChangeMetrics): void {
//   const message = syncClient?.t(
//     'Large change detected. {0} characters changed ({1}%).',
//     metrics.changedChars,
//     Math.round(metrics.changedRatio * 100)
//   ) || `Large change detected. ${metrics.changedChars} characters changed (${Math.round(metrics.changedRatio * 100)}%).`;
//
//   syncClient?.notifyHost('WARN', 'CHANGE_GUARD_EXCEEDED', message, ['resync', 'resetSession']);
// }
function handleChangeGuardExceeded(_metrics: ChangeMetrics): void {
  // ChangeGuard disabled - do nothing
}

function filterRemediations(remediation: string[]): Remediation[] {
  const valid: Remediation[] = ['resetSession', 'reopenWithTextEditor', 'resync', 'applySettings', 'trustWorkspace'];
  return remediation.filter((r): r is Remediation => (valid as string[]).includes(r));
}

function setupImageObserver(): void {
  if (!editorContainerEl || !syncClient) {return;}
  if (imageObserver) {return;}

  imageObserver = new MutationObserver(() => {
    resolveImagesInEditor();
  });

  imageObserver.observe(editorContainerEl, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src'],
  });
}

function resolveImagesInEditor(): void {
  if (!editorContainerEl || !syncClient) {return;}

  const allowWorkspaceImages = syncClient.getConfig()?.security.allowWorkspaceImages ?? true;
  if (!allowWorkspaceImages) {return;}

  const images = editorContainerEl.querySelectorAll('img');
  for (const img of images) {
    const srcAttr = img.getAttribute('src');
    if (!srcAttr) {continue;}

    // Track the original markdown src so we can reapply after ProseMirror re-renders.
    const originalSrc = img.dataset.originalSrc ?? srcAttr;
    img.dataset.originalSrc = originalSrc;

    // Only resolve relative paths (no URI scheme).
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(originalSrc)) {continue;}

    const cached = resolvedImageCache.get(originalSrc);
    if (cached) {
      if (img.getAttribute('src') !== cached) {
        img.setAttribute('src', cached);
      }
      continue;
    }

    if (pendingImageRequestsBySrc.has(originalSrc)) {continue;}

    const requestId = crypto.randomUUID();
    pendingImageRequestsById.set(requestId, originalSrc);
    pendingImageRequestsBySrc.set(originalSrc, requestId);
    syncClient.resolveImage(requestId, originalSrc);
  }
}

function handleImageResolved(requestId: string, resolvedSrc: string): void {
  const originalSrc = pendingImageRequestsById.get(requestId);
  if (!originalSrc) {return;}

  pendingImageRequestsById.delete(requestId);
  pendingImageRequestsBySrc.delete(originalSrc);
  resolvedImageCache.set(originalSrc, resolvedSrc);

  if (!editorContainerEl) {return;}

  // Apply to all current images with the same original src.
  const images = editorContainerEl.querySelectorAll('img');
  for (const img of images) {
    if (img.dataset.originalSrc === originalSrc) {
      img.setAttribute('src', resolvedSrc);
    }
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
  if (!syncIndicator) {return;}

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
