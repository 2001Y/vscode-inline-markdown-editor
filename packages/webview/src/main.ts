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
 * 状態永続化 (設計書 13.2):
 * - getState/setState でスクロール位置を保存
 * - タブ切り替え/リロード後も位置を復元
 */

import { SyncClient } from './protocol/client.js';
import { createEditor, type EditorInstance } from './editor/createEditor.js';
import { createFindWidget, type FindWidgetApi, type FindWidgetState } from './editor/findWidget.js';
import type { Replace, Remediation, WebviewConfig } from './protocol/types.js';
import type { ChangeMetrics } from './editor/diffEngine.js';
import { executeCommand, type CommandName } from './editor/commands.js';
import { getRuntimeConfig, setRuntimeConfig } from './editor/runtimeConfig.js';
import { createLogger, setDebugEnabled } from './logger.js';
import './styles.css';

interface AppState {
  scrollTop?: number;
  scrollLeft?: number;
  findWidget?: FindWidgetState;
}

let editorInstance: EditorInstance | null = null;
let syncClient: SyncClient | null = null;
let editorContainerEl: HTMLElement | null = null;
let appRootEl: HTMLElement | null = null;
let findWidget: FindWidgetApi | null = null;
let appState: AppState = {};
let saveStateTimer: number | null = null;
let loadingEl: HTMLElement | null = null;
let initSequence = 0;
let colorResolveEl: HTMLSpanElement | null = null;
let colorCompositeCtx: CanvasRenderingContext2D | null = null;
let lastOpaqueBlockShellBg = '';
let blockShellThemeObserver: MutationObserver | null = null;

const INIT_LOADING_TIMEOUT_MS = 15000;

const log = createLogger('Main');

const VALID_EDITOR_COMMANDS: ReadonlySet<CommandName> = new Set([
  'toggleBold',
  'toggleItalic',
  'toggleStrike',
  'toggleCode',
  'toggleUnderline',
  'toggleHeading1',
  'toggleHeading2',
  'toggleHeading3',
  'toggleHeading4',
  'toggleHeading5',
  'toggleHeading6',
  'toggleBulletList',
  'toggleOrderedList',
  'toggleBlockquote',
  'toggleCodeBlock',
  'indentBlock',
  'outdentBlock',
  'indentListItem',
  'outdentListItem',
  'setHorizontalRule',
  'undo',
  'redo',
]);

type FindCommandName =
  | 'find'
  | 'replace'
  | 'findNext'
  | 'findPrevious'
  | 'closeFind'
  | 'toggleMatchCase'
  | 'toggleWholeWord'
  | 'toggleRegex'
  | 'toggleFindInSelection'
  | 'togglePreserveCase';

const FIND_WIDGET_COMMANDS: ReadonlySet<FindCommandName> = new Set([
  'find',
  'replace',
  'findNext',
  'findPrevious',
  'closeFind',
  'toggleMatchCase',
  'toggleWholeWord',
  'toggleRegex',
  'toggleFindInSelection',
  'togglePreserveCase',
]);

const isValidEditorCommand = (command: unknown): command is CommandName => {
  return typeof command === 'string' && VALID_EDITOR_COMMANDS.has(command as CommandName);
};

const isFindWidgetCommand = (command: unknown): command is FindCommandName => {
  return typeof command === 'string' && FIND_WIDGET_COMMANDS.has(command as FindCommandName);
};

// Image resolution state (workspace relative paths -> webview URIs)
const pendingImageRequestsById = new Map<string, string>(); // requestId -> originalSrc
const pendingImageRequestsBySrc = new Map<string, string>(); // originalSrc -> requestId
const resolvedImageCache = new Map<string, string>(); // originalSrc -> resolvedSrc
let imageObserver: MutationObserver | null = null;

function main(): void {
  log.info('Webview main() starting');
  
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    log.error('App container not found - fatal error');
    return;
  }
  appRootEl = appContainer;
  setupBlockShellThemeObserver();

  loadingEl = appContainer.querySelector('.app-loading') as HTMLElement | null;
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'app-loading is-visible';
    loadingEl.setAttribute('role', 'status');
    loadingEl.setAttribute('aria-label', 'Loading');
    loadingEl.innerHTML = '<div class="app-loading-spinner" aria-hidden="true"></div>';
    appContainer.appendChild(loadingEl);
  } else {
    loadingEl.classList.add('is-visible');
  }

  log.info('Creating editor container');
  editorContainerEl = document.createElement('div');
  editorContainerEl.className = 'editor-container';
  appContainer.appendChild(editorContainerEl);

  log.info('Creating SyncClient');
  syncClient = new SyncClient({
    onInit: handleInit,
    onDocChanged: handleDocChanged,
    onError: handleError,
    onImageResolved: handleImageResolved,
    onConfigChanged: handleConfigChanged,
  });

  window.addEventListener('error', (event) => {
    const errorEvent = event as ErrorEvent;
    const runtimeError = errorEvent.error;
    syncClient?.notifyHost(
      'ERROR',
      'WEBVIEW_RUNTIME_ERROR',
      errorEvent.message || 'Webview runtime error',
      ['resetSession', 'reopenWithTextEditor'],
      {
        filename: errorEvent.filename ?? null,
        lineno: errorEvent.lineno ?? null,
        colno: errorEvent.colno ?? null,
        error: runtimeError ? String(runtimeError) : null,
        stack:
          runtimeError && typeof runtimeError === 'object' && 'stack' in runtimeError
            ? String((runtimeError as { stack?: unknown }).stack ?? '')
            : null,
      }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const reasonStack =
      reason && typeof reason === 'object' && 'stack' in reason
        ? String((reason as { stack?: unknown }).stack ?? '')
        : null;
    syncClient?.notifyHost(
      'ERROR',
      'WEBVIEW_UNHANDLED_REJECTION',
      'Unhandled promise rejection in webview',
      ['resetSession', 'reopenWithTextEditor'],
      { reason: reason ? String(reason) : null, stack: reasonStack }
    );
  });

  log.info('Starting SyncClient');
  syncClient.start();
  log.info('Webview initialization complete');

}

const setLoadingVisible = (visible: boolean, reason: string): void => {
  if (!loadingEl) {
    return;
  }
  loadingEl.classList.toggle('is-visible', visible);
  log.debug('Loading indicator', { visible, reason });
};

const waitForInitialContent = (
  reason: string,
  sequence: number,
  startedAt: number,
  contentLength: number,
  timeoutMs: number
): void => {
  const startedAtPerf = performance.now();

  const check = () => {
    if (sequence !== initSequence) {
      return;
    }

    if (!editorContainerEl) {
      const elapsedMs = Math.round(performance.now() - startedAtPerf);
      setLoadingVisible(false, 'init-missing-container');
      syncClient?.notifyHost(
        'ERROR',
        'WEBVIEW_CONTAINER_MISSING',
        'Webview init failed: editor container missing.',
        ['resetSession', 'reopenWithTextEditor'],
        {
          startedAt,
          elapsedMs,
          contentLength,
          reason,
        }
      );
      return;
    }

    const contentEl = editorContainerEl.querySelector('.inline-markdown-editor-content');
    if (contentEl) {
      setLoadingVisible(false, reason);
      return;
    }

    const elapsed = performance.now() - startedAtPerf;
    if (elapsed >= timeoutMs) {
      const elapsedMs = Math.round(elapsed);
      setLoadingVisible(false, 'init-timeout');
      syncClient?.notifyHost(
        'ERROR',
        'WEBVIEW_INIT_TIMEOUT',
        'Webview init timed out while waiting for editor content.',
        ['resetSession', 'reopenWithTextEditor'],
        {
          startedAt,
          elapsedMs,
          timeoutMs,
          contentLength,
          reason,
        }
      );
      return;
    }

    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);
};

const scheduleSaveState = (): void => {
  if (!syncClient) {
    return;
  }
  if (saveStateTimer) {
    clearTimeout(saveStateTimer);
  }
  saveStateTimer = window.setTimeout(() => {
    saveStateTimer = null;
    syncClient?.saveState(appState);
  }, 150);
};

const ensureColorResolveElement = (): HTMLSpanElement => {
  if (colorResolveEl && colorResolveEl.isConnected) {
    return colorResolveEl;
  }
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
  el.style.position = 'absolute';
  el.style.pointerEvents = 'none';
  (document.body ?? document.documentElement).appendChild(el);
  colorResolveEl = el;
  return el;
};

const resolveCssColor = (expression: string): string | null => {
  const resolver = ensureColorResolveElement();
  resolver.style.color = '';
  resolver.style.color = expression;
  if (!resolver.style.color) {
    return null;
  }
  const resolved = getComputedStyle(resolver).color.trim();
  return resolved || null;
};

const ensureColorCompositor = (): CanvasRenderingContext2D | null => {
  if (colorCompositeCtx) {
    return colorCompositeCtx;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) {
    return null;
  }
  colorCompositeCtx = context;
  return colorCompositeCtx;
};

const compositeOpaqueColor = (foreground: string, background: string): string | null => {
  const context = ensureColorCompositor();
  if (!context) {
    return null;
  }
  context.globalCompositeOperation = 'copy';
  context.fillStyle = background;
  context.fillRect(0, 0, 1, 1);
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = foreground;
  context.fillRect(0, 0, 1, 1);
  const pixels = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${pixels[0]} ${pixels[1]} ${pixels[2]})`;
};

const applyOpaqueBlockShellBackground = (reason: string): void => {
  const foreground = resolveCssColor(
    'var(--vscode-textCodeBlock-background, var(--vscode-editor-background, #ffffff))'
  );
  const background = resolveCssColor('var(--vscode-editor-background, #ffffff)');

  if (!foreground || !background) {
    log.warn('Failed to resolve colors for opaque block shell background', {
      reason,
      foregroundResolved: Boolean(foreground),
      backgroundResolved: Boolean(background),
    });
    return;
  }

  const composed = compositeOpaqueColor(foreground, background);
  if (!composed) {
    log.warn('Failed to compose opaque block shell background');
    return;
  }
  if (composed === lastOpaqueBlockShellBg) {
    return;
  }
  lastOpaqueBlockShellBg = composed;
  document.documentElement.style.setProperty('--inline-mark-opaque-block-shell-bg', composed);
  log.debug('Applied opaque block shell background', {
    reason,
    foreground,
    background,
    composed,
  });
};

const setupBlockShellThemeObserver = (): void => {
  if (blockShellThemeObserver) {
    blockShellThemeObserver.disconnect();
    blockShellThemeObserver = null;
  }

  const observer = new MutationObserver(() => {
    applyOpaqueBlockShellBackground('theme-mutation');
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-vscode-theme-id', 'data-vscode-theme-kind'],
  });
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-vscode-theme-id', 'data-vscode-theme-kind'],
    });
  }
  blockShellThemeObserver = observer;
};

function handleInit(
  content: string,
  _version: number,
  config: WebviewConfig,
  _i18n: Record<string, string>
): void {
  const initStartedAt = Date.now();
  setDebugEnabled(Boolean(config.debug?.enabled));
  log.info('Init received', {
    contentLength: content.length,
    version: _version,
    configDebugEnabled: config.debug.enabled
  });

  setRuntimeConfig(config);

  setLoadingVisible(true, 'init-start');

  if (!editorContainerEl) {
    log.error('Editor container not found - fatal error');
    syncClient?.notifyHost(
      'ERROR',
      'WEBVIEW_CONTAINER_MISSING',
      'Webview init failed: editor container missing.',
      ['resetSession', 'reopenWithTextEditor'],
      {
        startedAt: initStartedAt,
        reason: 'init-start',
        contentLength: content.length,
        version: _version,
      }
    );
    return;
  }

  if (editorInstance) {
    log.info('Destroying existing editor instance');
    editorInstance.destroy();
  }

  if (findWidget) {
    findWidget.destroy();
    findWidget = null;
  }

  const savedState = syncClient?.loadState<AppState>();
  appState = savedState ?? {};

  applyViewConfig(config);
  applyOpaqueBlockShellBackground('init');

  log.info('Creating new editor instance');
  editorInstance = createEditor({
    container: editorContainerEl,
    syncClient: syncClient!,
    onChangeGuardExceeded: handleChangeGuardExceeded,
    initialContent: content,
  });

  resolveImagesInEditor();
  setupImageObserver();

  findWidget = createFindWidget({
    editor: editorInstance.editor,
    container: appRootEl ?? editorContainerEl,
    scrollContainer: editorContainerEl,
    onVisibilityChange: (visible) => {
      syncClient?.setFindWidgetVisible(visible);
    },
    onStateChange: (state) => {
      appState = { ...appState, findWidget: state };
      scheduleSaveState();
    },
  });

  if (appState.findWidget) {
    findWidget.restoreState(appState.findWidget);
  }

  if (savedState?.scrollTop !== undefined) {
    log.debug('Restoring scroll position', { scrollTop: savedState.scrollTop });
    editorContainerEl.scrollTop = savedState.scrollTop;
  }

  initSequence += 1;
  waitForInitialContent(
    'init-complete',
    initSequence,
    initStartedAt,
    content.length,
    INIT_LOADING_TIMEOUT_MS
  );

  log.info('Editor initialization complete', { 
    contentLength: content.length,
    version: _version
  });
}

function handleConfigChanged(config: WebviewConfig): void {
  setDebugEnabled(Boolean(config.debug?.enabled));
  log.info('Config change received', {
    view: config.view,
    preview: config.preview,
    security: {
      allowWorkspaceImages: config.security.allowWorkspaceImages,
    },
    debug: config.debug,
  });

  const previousAllowWorkspaceImages = getRuntimeConfig()?.security.allowWorkspaceImages ?? true;
  const nextAllowWorkspaceImages = config.security.allowWorkspaceImages ?? true;
  setRuntimeConfig(config);

  applyViewConfig(config);
  applyOpaqueBlockShellBackground('config-changed');

  if (!editorContainerEl) {
    return;
  }

  if (previousAllowWorkspaceImages !== nextAllowWorkspaceImages) {
    if (!nextAllowWorkspaceImages) {
      clearResolvedImages();
      resolveImagesInEditor();
    } else {
      resolveImagesInEditor();
    }
  }
}

function applyViewConfig(config: WebviewConfig): void {
  if (!editorContainerEl) {
    return;
  }
  const fullWidth = config.view?.fullWidth ?? true;
  const noWrap = config.view?.noWrap ?? false;
  editorContainerEl.classList.toggle('is-full-width', fullWidth);
  editorContainerEl.classList.toggle('is-no-wrap', noWrap);
  log.debug('View config applied', { fullWidth, noWrap });
}

function handleDocChanged(
  _version: number,
  changes: Replace[],
  fullContent?: string
): void {
  log.debug('DocChanged received', { 
    version: _version, 
    changesCount: changes.length, 
    hasFullContent: fullContent !== undefined,
    fullContentLength: fullContent?.length
  });

  if (!editorInstance) {
    log.warn('No editor instance - ignoring docChanged');
    return;
  }

  if (fullContent !== undefined) {
    log.info('Applying full content replacement', { contentLength: fullContent.length });
    editorInstance.setContent(fullContent);
    resolveImagesInEditor();
  } else if (changes.length > 0) {
    log.debug('Applying incremental changes', { changesCount: changes.length });
    editorInstance.applyChanges(changes);
    resolveImagesInEditor();
  } else {
    log.debug('No changes to apply');
  }
}

function handleError(code: string, message: string, remediation: string[]): void {
  log.error('Error', { code, message });
  // Surface via VS Code native notifications (host)
  syncClient?.notifyHost('ERROR', code, message, filterRemediations(remediation));
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
    if (cached !== undefined) {
      if (cached) {
        if (img.getAttribute('src') !== cached) {
          img.setAttribute('src', cached);
        }
      } else if (img.hasAttribute('src')) {
        img.removeAttribute('src');
      }
      continue;
    }

    if (pendingImageRequestsBySrc.has(originalSrc)) {continue;}

    if (img.getAttribute('src') === originalSrc) {
      img.removeAttribute('src');
    }

    const requestId = crypto.randomUUID();
    pendingImageRequestsById.set(requestId, originalSrc);
    pendingImageRequestsBySrc.set(originalSrc, requestId);
    syncClient.resolveImage(requestId, originalSrc);
  }
}

function clearResolvedImages(): void {
  pendingImageRequestsById.clear();
  pendingImageRequestsBySrc.clear();
  resolvedImageCache.clear();
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
      if (!resolvedSrc) {
        if (img.hasAttribute('src')) {
          img.removeAttribute('src');
        }
        continue;
      }
      img.setAttribute('src', resolvedSrc);
    }
  }
}

function handleFindCommand(command: FindCommandName): void {
  if (!findWidget) {
    log.warn('Find command received but widget not initialized', { command });
    return;
  }
  switch (command) {
    case 'find':
      findWidget.openFind({ seedFromSelection: true });
      return;
    case 'replace':
      findWidget.openReplace({ seedFromSelection: true });
      return;
    case 'findNext':
      if (!findWidget.isVisible()) {
        findWidget.openFind({ seedFromSelection: false });
      }
      findWidget.findNext();
      return;
    case 'findPrevious':
      if (!findWidget.isVisible()) {
        findWidget.openFind({ seedFromSelection: false });
      }
      findWidget.findPrev();
      return;
    case 'closeFind':
      findWidget.close();
      return;
    case 'toggleMatchCase':
      findWidget.toggleMatchCase();
      return;
    case 'toggleWholeWord':
      findWidget.toggleWholeWord();
      return;
    case 'toggleRegex':
      findWidget.toggleRegex();
      return;
    case 'toggleFindInSelection':
      findWidget.toggleFindInSelection();
      return;
    case 'togglePreserveCase':
      findWidget.togglePreserveCase();
      return;
  }
}

window.addEventListener('beforeunload', () => {
  if (syncClient) {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement;
    if (editorContainer) {
      appState = {
        ...appState,
        scrollTop: editorContainer.scrollTop,
        scrollLeft: editorContainer.scrollLeft,
        findWidget: findWidget?.getState() ?? appState.findWidget,
      };
      syncClient.saveState(appState);
    }
  }
});

/**
 * VSCode keybindings からのコマンドを処理
 * SyncClientのプロトコルとは別に、シンプルなコマンド実行用
 */
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type === 'editorCommand' && msg.command) {
    if (!document.hasFocus()) {
      log.warn('Editor command ignored (webview not focused)', { command: msg.command });
      return;
    }
    if (isFindWidgetCommand(msg.command)) {
      log.info('Executing find command', { command: msg.command });
      handleFindCommand(msg.command);
      return;
    }
    if (!editorInstance) {
      log.warn('Editor command received but no editor instance');
      return;
    }
    if (!isValidEditorCommand(msg.command)) {
      log.warn('Unknown editor command', { command: msg.command });
      return;
    }
    log.info('Executing editor command', { command: msg.command });
    executeCommand(editorInstance.editor, msg.command);
  }
});

main();
