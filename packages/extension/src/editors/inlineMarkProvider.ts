/**
 * 役割: Markdown ファイル用の CustomTextEditorProvider 実装
 * 責務: Webview ライフサイクル管理、メッセージパッシング、ドキュメント同期の調整
 * 不変条件: TextDocument が唯一の真実 (source of truth)。全 Webview は同一状態に収束すること
 * 
 * 設計書参照: 6.2, 6.4 (InlineMarkProvider の責務)
 * 
 * 設計原則 (設計書 4.2):
 * - 原則 A: 真実は常に TextDocument（Webview は入力と表示を担う）
 * - 原則 B: Webview 更新通知は onDidChangeTextDocument 起点に統一
 * - 原則 C: 整合性は baseVersion + txId で担保
 * 
 * ポリシー (設計書 4.3):
 * - フォールバック禁止: 自動で標準テキストエディタへ切り替えない
 * - サイレントリカバリ禁止: 失敗を隠さない（ログとエラー表示）
 * - 不整合は完全リセット: 状態が壊れたらセッション破棄→再初期化
 * - 完全ログ主義: 原因特定に必要な入出力を記録
 * 
 * 同期フロー (設計書 10):
 * 1. Webview 起動 → ready 送信
 * 2. Extension は init (全文 + version + sessionId/clientId) を返信
 * 3. 編集: Webview → edit(baseVersion, txId, changes) → Extension
 * 4. Extension: baseVersion 検証 → 一致なら applyEdit → ack/nack 返信
 * 5. 外部変更: onDidChangeTextDocument → 全 Webview へ docChanged ブロードキャスト
 * 
 * 重要な運用ルール (設計書 9.5):
 * - ルール 1: docChanged は onDidChangeTextDocument 起点に統一（二重通知防止）
 * - ルール 2: baseVersion 不一致の edit は nack（破壊的適用を防ぐ）
 * - ルール 3: Webview は docChanged 適用中に edit を送らない（ループ防止）
 * - ルール 4: in-flight は client ごとに 1 件まで（coalesce）
 * 
 * セキュリティ (設計書 8, 12.3, 18):
 * - CSP: default-src 'none' + nonce による script 制約
 * - 危険スキーム禁止: javascript:/command:/vscode:/file: は常にブロック
 * - リンクは openExternal 経由で開く
 * - 画像: ワークスペース内は asWebviewUri、リモートはオプション
 * - HTML: コードブロックとして表示
 * 
 * docUri の扱い (設計書 9.2 補足):
 * - Webview から来た docUri は信頼しない（照合のみ）
 * - Extension 側は resolveCustomTextEditor で panel と document の対応を把握済み
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  type WebviewToExtensionMessage,
  type WebviewConfig,
  createInitMessage,
  createAckMessage,
  createNackMessage,
  createDocChangedMessage,
  createErrorMessage,
  createImageResolvedMessage,
  createNestedPageCreatedMessage,
  createNestedPageCreateAckMessage,
  createNestedPageCreateFailedMessage,
  isValidWebviewMessage,
} from '../protocol/messages.js';
import {
  replacesToWorkspaceEdit,
  contentChangeEventsToReplaces,
  calculateChangeMetrics,
  isChangeGuardExceeded,
} from '../util/textEdits.js';
import { logger } from '../util/log.js';

interface WebviewPanel {
  panel: vscode.WebviewPanel;
  clientId: string;
  ready: boolean;
}

interface DocumentState {
  uri: vscode.Uri;
  sessionId: string;
  panels: Map<string, WebviewPanel>;
  /**
   * Track which doc version was produced by which client.
   * Key: TextDocument.version after the edit is applied
   * Value: originating clientId
   *
   * Why:
   * - We want to tag docChanged as `reason=self` for the originating Webview only,
   *   so the active editor does NOT re-render itself on every keystroke (cursor jump fix).
   * - For other Webviews, we still broadcast as `reason=external` and they apply it.
   *
   * See 詳細設計.md 9.4/9.5 + 追加方針(カーソル末尾ジャンプ)。
   */
  selfChangeVersions: Map<number, string>;
}

const REQUIRED_MARKDOWN_SETTINGS = {
  'editor.formatOnSave': false,
  'editor.formatOnType': false,
  'editor.formatOnPaste': false,
  'editor.codeActionsOnSave': {},
  'files.trimTrailingWhitespace': false,
  'files.insertFinalNewline': false,
};

export class InlineMarkProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'inlineMark.editor';

  private documentStates = new Map<string, DocumentState>();
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionUri = context.extensionUri;

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDidChangeTextDocument(e))
    );
  }

  public static register(context: vscode.ExtensionContext): InlineMarkProvider {
    const provider = new InlineMarkProvider(context);

    const webviewConfig = vscode.workspace.getConfiguration('inlineMark.webview');
    const retainContextWhenHidden = webviewConfig.get<boolean>('retainContextWhenHidden', true);

    const providerRegistration = vscode.window.registerCustomEditorProvider(
      InlineMarkProvider.viewType,
      provider,
      {
        webviewOptions: {
          // UX: Avoid visible "re-render" on tab switching.
          // Trade-off: higher memory usage while editors are hidden.
          // See 詳細設計.md 13 (Webview lifecycle) / 追加方針(タブ移動の再描画)。
          //
          // Note: this is read at activation time; changes require window reload.
          retainContextWhenHidden,
        },
        supportsMultipleEditorsPerDocument: true,
      }
    );

    context.subscriptions.push(providerRegistration);
    context.subscriptions.push(provider);

    return provider;
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docKey = document.uri.toString();

    logger.info('resolveCustomTextEditor called', {
      docUri: docKey,
      docVersion: document.version,
      details: {
        docLineCount: document.lineCount,
        isTrusted: vscode.workspace.isTrusted,
      },
    });

    if (!vscode.workspace.isTrusted) {
      logger.warn('Workspace not trusted - blocking editor', { docUri: docKey });
      await this.showUntrustedWorkspaceError(webviewPanel);
      return;
    }

    logger.debug('Checking required settings', { docUri: docKey });
    const settingsValid = await this.checkRequiredSettings();
    if (!settingsValid) {
      logger.info('Required settings not configured - showing dialog', { docUri: docKey });
      const applied = await this.showSettingsRequiredDialog();
      if (!applied) {
        logger.warn('Settings not applied - blocking editor', { docUri: docKey });
        await this.showSettingsNotConfiguredError(webviewPanel);
        return;
      }
      logger.info('Settings applied successfully', { docUri: docKey });
    }

    let state = this.documentStates.get(docKey);
    if (!state) {
      state = {
        uri: document.uri,
        sessionId: crypto.randomUUID(),
        panels: new Map(),
        selfChangeVersions: new Map(),
      };
      this.documentStates.set(docKey, state);
      // デバッグモード時は JSONL ログを開始
      logger.setupDocumentLog(document.uri);
    }

    const clientId = crypto.randomUUID();
    const panelState: WebviewPanel = {
      panel: webviewPanel,
      clientId,
      ready: false,
    };
    state.panels.set(clientId, panelState);

    webviewPanel.webview.options = this.getWebviewOptions();
    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage((msg) =>
      this.onDidReceiveMessage(document, state!, clientId, msg)
    );

    webviewPanel.onDidDispose(() => {
      messageDisposable.dispose();
      state?.panels.delete(clientId);
      if (state?.panels.size === 0) {
        this.documentStates.delete(docKey);
        // ドキュメントのログを終了
        logger.cleanupDocumentLog(document.uri);
      }
      logger.debug('Webview disposed', { clientId, docUri: docKey });
    });

    logger.info('Webview resolved', {
      sessionId: state.sessionId,
      clientId,
      docUri: docKey,
      docVersion: document.version,
    });
  }

  private getWebviewOptions(): vscode.WebviewOptions {
    const config = vscode.workspace.getConfiguration('inlineMark.security');
    const allowWorkspaceImages = config.get<boolean>('allowWorkspaceImages', true);

    const localResourceRoots: vscode.Uri[] = [
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview'),
    ];

    if (allowWorkspaceImages && vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        localResourceRoots.push(folder.uri);
      }
    }

    return {
      enableScripts: true,
      localResourceRoots,
    };
  }

  private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const mediaPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'webview');
    const nonce = crypto.randomBytes(16).toString('base64');

    type ViteManifestChunk = {
      file: string;
      src?: string;
      isEntry?: boolean;
      css?: string[];
    };

    let manifestData: Record<string, ViteManifestChunk> | null = null;
    try {
      const manifestPath = vscode.Uri.joinPath(mediaPath, '.vite', 'manifest.json');
      const manifestContent = await vscode.workspace.fs.readFile(manifestPath);
      manifestData = JSON.parse(Buffer.from(manifestContent).toString('utf-8')) as Record<
        string,
        ViteManifestChunk
      >;
    } catch (error) {
      logger.warn('Failed to read Vite manifest.json', {
        errorCode: 'WEBVIEW_MANIFEST_READ_FAILED',
        errorStack: String(error),
      });
    }

    const entryChunk =
      manifestData ? Object.values(manifestData).find((chunk) => chunk?.isEntry) : undefined;

    const scriptFile = entryChunk?.file ?? 'index.js';
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, scriptFile));

    const cssFiles = entryChunk?.css ?? [];
    const styleLinks = cssFiles
      .map((file) => webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, file)))
      .map((uri) => `<link rel="stylesheet" href="${uri}">`)
      .join('\n  ');

    const csp = this.buildCsp(webview, nonce);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  ${styleLinks}
  <title>inlineMark</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private buildCsp(webview: vscode.Webview, nonce: string): string {
    const config = vscode.workspace.getConfiguration('inlineMark.security');
    const allowRemoteImages = config.get<boolean>('allowRemoteImages', false);
    const allowInsecureRemoteImages = config.get<boolean>('allowInsecureRemoteImages', false);

    let imgSrc = `${webview.cspSource} data:`;
    if (allowRemoteImages) {
      imgSrc += ' https:';
    }
    if (allowInsecureRemoteImages) {
      imgSrc += ' http:';
    }

    return [
      `default-src 'none'`,
      `base-uri 'none'`,
      `form-action 'none'`,
      `frame-ancestors 'none'`,
      `img-src ${imgSrc}`,
      `font-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    ].join('; ');
  }

  private async onDidReceiveMessage(
    document: vscode.TextDocument,
    state: DocumentState,
    clientId: string,
    msg: unknown
  ): Promise<void> {
    if (!isValidWebviewMessage(msg)) {
      logger.warn('Invalid message received', {
        clientId,
        docUri: document.uri.toString(),
        details: { msg },
      });
      return;
    }

    const panel = state.panels.get(clientId);
    if (!panel) {
      logger.warn('Panel not found for message', { clientId });
      return;
    }

    logger.trace('Message received', {
      clientId,
      docUri: document.uri.toString(),
      details: { type: msg.type },
    });

    if (msg.type === 'createNestedPage') {
      logger.warn('Nested page create message received', {
        clientId,
        docUri: document.uri.toString(),
        details: { requestId: msg.requestId, title: msg.title },
      });
    }

    switch (msg.type) {
      case 'ready':
        await this.handleReady(document, state, panel);
        break;
      case 'edit':
        await this.handleEdit(document, state, clientId, msg);
        break;
      case 'requestResync':
        await this.handleRequestResync(document, state, panel);
        break;
      case 'logClient':
        this.handleLogClient(clientId, msg);
        break;
      case 'openLink':
        await this.handleOpenLink(clientId, msg);
        break;
      case 'copyToClipboard':
        await this.handleCopyToClipboard(clientId, msg);
        break;
      case 'overwriteSave':
        await this.handleOverwriteSave(document, clientId, msg);
        break;
      case 'reopenWithTextEditor':
        await this.handleReopenWithTextEditor(clientId);
        break;
      case 'exportLogs':
        await this.handleExportLogs(clientId);
        break;
      case 'requestResyncWithConfirm':
        await this.handleRequestResyncWithConfirm(document, state, panel, clientId);
        break;
      case 'overwriteSaveWithConfirm':
        await this.handleOverwriteSaveWithConfirm(document, clientId, msg);
        break;
      case 'resolveImage':
        await this.handleResolveImage(document, state, panel, clientId, msg);
        break;
      case 'createNestedPage':
        await this.handleCreateNestedPage(document, state, panel, clientId, msg);
        break;
      case 'openNestedPage':
        await this.handleOpenNestedPage(document, clientId, msg);
        break;
      case 'notifyHost':
        await this.handleNotifyHost(document, state, panel, clientId, msg);
        break;
      case 'menuStateChange':
        this.handleMenuStateChange(msg);
        break;
    }
  }

  /**
   * Handle menu state change from webview for context key management
   */
  private handleMenuStateChange(msg: { visible?: boolean }): void {
    const visible = msg.visible ?? false;
    // Set context key for keybinding when clause
    vscode.commands.executeCommand('setContext', 'inlineMark.menuVisible', visible);
    logger.debug('Menu state changed', { details: { visible } });
  }

  private async handleReady(
    document: vscode.TextDocument,
    state: DocumentState,
    panel: WebviewPanel
  ): Promise<void> {
    panel.ready = true;

    const config = this.getWebviewConfig();
    const locale = vscode.env.language;
    const i18n = await this.loadI18nBundle(locale);

    const initMessage = createInitMessage(
      document.version,
      document.getText(),
      state.sessionId,
      panel.clientId,
      locale,
      i18n,
      config
    );

    await panel.panel.webview.postMessage(initMessage);

    logger.info('Init sent', {
      sessionId: state.sessionId,
      clientId: panel.clientId,
      docUri: document.uri.toString(),
      docVersion: document.version,
    });
  }

  private async handleEdit(
    document: vscode.TextDocument,
    state: DocumentState,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'edit' }
  ): Promise<void> {
    const { txId, baseVersion, changes } = msg;
    const panel = state.panels.get(clientId);

    if (!panel) {
      logger.warn('Panel not found for edit', { clientId, txId });
      return;
    }

    logger.debug('Edit received', {
      clientId,
      txId,
      baseVersion,
      docVersion: document.version,
      changesCount: changes.length,
    });

    if (baseVersion !== document.version) {
      const nackMessage = createNackMessage(txId, document.version, 'baseVersionMismatch', state.sessionId);
      await panel.panel.webview.postMessage(nackMessage);

      logger.info('Edit nacked (version mismatch)', {
        clientId,
        txId,
        baseVersion,
        docVersion: document.version,
      });
      return;
    }

    if (changes.length === 0) {
      const ackMessage = createAckMessage(txId, document.version, 'noop', state.sessionId);
      await panel.panel.webview.postMessage(ackMessage);

      logger.debug('Edit acked (noop)', { clientId, txId, docVersion: document.version });
      return;
    }

    const metrics = calculateChangeMetrics(changes, document.getText().length);
    const changeGuardConfig = this.getChangeGuardConfig();

    if (isChangeGuardExceeded(metrics, changeGuardConfig)) {
      logger.warn('Change guard exceeded', {
        clientId,
        txId,
        details: { metrics, config: changeGuardConfig },
      });
    }

    // Mark the next document version as originating from this client.
    // onDidChangeTextDocument will use this to send `reason=self` to the originating Webview
    // (so it can avoid re-render and keep the caret position stable).
    const expectedVersion = baseVersion + 1;
    state.selfChangeVersions.set(expectedVersion, clientId);

    try {
      const workspaceEdit = replacesToWorkspaceEdit(document, changes);
      const success = await vscode.workspace.applyEdit(workspaceEdit);

      if (success) {
        const ackMessage = createAckMessage(txId, expectedVersion, 'applied', state.sessionId);
        await panel.panel.webview.postMessage(ackMessage);

        if (document.version !== expectedVersion) {
          logger.warn('Document version mismatch after applyEdit', {
            clientId,
            txId,
            baseVersion,
            docVersion: document.version,
            appliedVersion: expectedVersion,
          });
        }

        logger.info('Edit applied', {
          clientId,
          txId,
          docVersion: expectedVersion,
          changesCount: changes.length,
        });
      } else {
        state.selfChangeVersions.delete(expectedVersion);
        const nackMessage = createNackMessage(txId, document.version, 'applyFailed', state.sessionId);
        await panel.panel.webview.postMessage(nackMessage);

        logger.error('Edit apply failed', { clientId, txId, docVersion: document.version });
      }
    } catch (error) {
      state.selfChangeVersions.delete(expectedVersion);
      const nackMessage = createNackMessage(
        txId,
        document.version,
        'applyFailed',
        state.sessionId,
        String(error)
      );
      await panel.panel.webview.postMessage(nackMessage);

      logger.error('Edit apply error', {
        clientId,
        txId,
        errorCode: 'APPLY_EDIT_FAILED',
        errorStack: String(error),
      });
    }
  }

  private async handleRequestResync(
    document: vscode.TextDocument,
    state: DocumentState,
    panel: WebviewPanel
  ): Promise<void> {
    const docChangedMessage = createDocChangedMessage(
      document.version,
      'external',
      [],
      state.sessionId,
      document.getText()
    );

    await panel.panel.webview.postMessage(docChangedMessage);

    logger.info('Resync sent', {
      clientId: panel.clientId,
      docUri: document.uri.toString(),
      docVersion: document.version,
    });
  }

  private handleLogClient(
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'logClient' }
  ): void {
    const config = vscode.workspace.getConfiguration('inlineMark.debug');
    if (!config.get<boolean>('enabled', false)) {return;}

    logger.log(msg.level, `[Webview] ${msg.message}`, {
      clientId,
      details: msg.details,
    });
  }

  private async handleOpenLink(
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'openLink' }
  ): Promise<void> {
    const { url } = msg;

    logger.info('Open link requested', { clientId, details: { url } });

    // Check for dangerous URL schemes (per spec 12.3.2: javascript/command/vscode/file are always blocked)
    const dangerousSchemes = ['javascript:', 'vbscript:', 'data:', 'command:', 'vscode:', 'file:'];
    const lowerUrl = url.toLowerCase();
    for (const scheme of dangerousSchemes) {
      if (lowerUrl.startsWith(scheme)) {
        logger.warn('Blocked dangerous URL scheme', { clientId, details: { url, scheme } });
        vscode.window.showWarningMessage(
          vscode.l10n.t('Blocked potentially dangerous link: {0}', url)
        );
        return;
      }
    }

    // Check if confirmation is required for external links
    const securityConfig = vscode.workspace.getConfiguration('inlineMark.security');
    const confirmExternalLinks = securityConfig.get<boolean>('confirmExternalLinks', true);

    try {
      const uri = vscode.Uri.parse(url);
      if (confirmExternalLinks) {
        logger.debug('Opening external link via VS Code opener', { clientId, details: { url } });
        await vscode.commands.executeCommand('vscode.open', uri);
      } else {
        await vscode.env.openExternal(uri);
      }
      logger.info('External link opened', {
        clientId,
        details: { url, method: confirmExternalLinks ? 'vscode.open' : 'openExternal' },
      });
    } catch (error) {
      logger.error('Failed to open external link', { 
        clientId, 
        errorCode: 'OPEN_LINK_FAILED',
        errorStack: String(error),
        details: { url }
      });
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to open link: {0}', String(error))
      );
    }
  }

  private async handleCopyToClipboard(
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'copyToClipboard' }
  ): Promise<void> {
    const { text } = msg;

    logger.info('Copy to clipboard requested', { clientId, details: { textLength: text.length } });

    try {
      await vscode.env.clipboard.writeText(text);
      logger.info('Text copied to clipboard', { clientId, details: { textLength: text.length } });
      vscode.window.showInformationMessage(vscode.l10n.t('Content copied to clipboard.'));
    } catch (error) {
      logger.error('Failed to copy to clipboard', { 
        clientId, 
        errorCode: 'CLIPBOARD_FAILED',
        errorStack: String(error)
      });
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to copy to clipboard: {0}', String(error))
      );
    }
  }

  private async handleOverwriteSave(
    document: vscode.TextDocument,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'overwriteSave' }
  ): Promise<void> {
    const { content } = msg;

    logger.info('Overwrite save requested', { 
      clientId, 
      docUri: document.uri.toString(),
      docVersion: document.version,
      details: { contentLength: content.length }
    });

    try {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      edit.replace(document.uri, fullRange, content);

      const success = await vscode.workspace.applyEdit(edit);
      
      if (success) {
        await document.save();
        logger.info('Overwrite save completed', { 
          clientId, 
          docUri: document.uri.toString(),
          docVersion: document.version
        });
        vscode.window.showInformationMessage(vscode.l10n.t('Document saved successfully.'));
      } else {
        logger.error('Overwrite save failed - edit not applied', { 
          clientId, 
          docUri: document.uri.toString()
        });
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to save document.'));
      }
    } catch (error) {
      logger.error('Overwrite save error', { 
        clientId, 
        docUri: document.uri.toString(),
        errorCode: 'OVERWRITE_SAVE_FAILED',
        errorStack: String(error)
      });
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to save document: {0}', String(error))
      );
    }
  }

  private async handleReopenWithTextEditor(clientId: string): Promise<void> {
    logger.info('Reopen with text editor requested', { clientId });
    try {
      await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
      logger.info('Reopened with text editor', { clientId });
    } catch (error) {
      logger.error('Failed to reopen with text editor', {
        clientId,
        errorCode: 'REOPEN_FAILED',
        errorStack: String(error),
      });
    }
  }

  private async handleExportLogs(clientId: string): Promise<void> {
    logger.info('Export logs requested', { clientId });
    try {
      await vscode.commands.executeCommand('inlineMark.exportLogs');
      logger.info('Export logs command executed', { clientId });
    } catch (error) {
      logger.error('Failed to export logs', {
        clientId,
        errorCode: 'EXPORT_LOGS_FAILED',
        errorStack: String(error),
      });
    }
  }

  private async handleRequestResyncWithConfirm(
    document: vscode.TextDocument,
    state: DocumentState,
    panel: WebviewPanel,
    clientId: string
  ): Promise<void> {
    logger.info('Resync with confirmation requested', { clientId, docUri: document.uri.toString() });

    const confirmButton = vscode.l10n.t('Resync');
    const cancelButton = vscode.l10n.t('Cancel');

    const result = await vscode.window.showWarningMessage(
      vscode.l10n.t('This will discard your current edits and reload the document from disk. Continue?'),
      { modal: true },
      confirmButton,
      cancelButton
    );

    if (result === confirmButton) {
      logger.info('Resync confirmed by user', { clientId });
      await this.handleRequestResync(document, state, panel);
    } else {
      logger.info('Resync cancelled by user', { clientId });
    }
  }

  private async handleOverwriteSaveWithConfirm(
    document: vscode.TextDocument,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'overwriteSaveWithConfirm' }
  ): Promise<void> {
    const { content } = msg;

    logger.info('Overwrite save with confirmation requested', {
      clientId,
      docUri: document.uri.toString(),
      details: { contentLength: content.length },
    });

    const confirmButton = vscode.l10n.t('Overwrite');
    const cancelButton = vscode.l10n.t('Cancel');

    const result = await vscode.window.showWarningMessage(
      vscode.l10n.t('This will overwrite the document with your current edits. Continue?'),
      { modal: true },
      confirmButton,
      cancelButton
    );

    if (result === confirmButton) {
      logger.info('Overwrite save confirmed by user', { clientId });
      await this.handleOverwriteSave(document, clientId, { ...msg, type: 'overwriteSave' });
    } else {
      logger.info('Overwrite save cancelled by user', { clientId });
    }
  }

  private async handleResolveImage(
    document: vscode.TextDocument,
    state: DocumentState,
    panel: WebviewPanel,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'resolveImage' }
  ): Promise<void> {
    const { requestId, src } = msg;

    logger.debug('Resolve image requested', {
      clientId,
      docUri: document.uri.toString(),
      details: { requestId, src },
    });

    // Check if workspace images are allowed
    const securityConfig = vscode.workspace.getConfiguration('inlineMark.security');
    const allowWorkspaceImages = securityConfig.get<boolean>('allowWorkspaceImages', true);

    if (!allowWorkspaceImages) {
      logger.info('Workspace images not allowed - returning original src', {
        clientId,
        details: { requestId, src },
      });
      await panel.panel.webview.postMessage(
        createImageResolvedMessage(requestId, src, state.sessionId)
      );
      return;
    }

    // Check if it's a relative path
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      logger.debug('Image is remote or data URL - returning original src', {
        clientId,
        details: { requestId, src },
      });
      await panel.panel.webview.postMessage(
        createImageResolvedMessage(requestId, src, state.sessionId)
      );
      return;
    }

    try {
      // セキュリティ: パストラバーサル攻撃を防止 (設計書 12.3.3)
      // ../ を含むパスはワークスペース外へのアクセスを試みる可能性がある
      // 正規化後のパスがワークスペース内にあることを確認する
      const normalizedSrc = src.replace(/\\/g, '/');
      
      // Resolve relative path against document directory
      const documentDir = vscode.Uri.joinPath(document.uri, '..');
      const imageUri = vscode.Uri.joinPath(documentDir, normalizedSrc);
      
      // ワークスペースフォルダを取得して、画像がワークスペース内にあることを確認
      // セキュリティ: path.relative を使用して、相対パスが '..' で始まらないことを確認
      // これにより、startsWith の境界条件問題（/ws と /ws2）や OS 差分を回避
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const isWithinWorkspace = workspaceFolders.some(folder => {
          const folderPath = folder.uri.fsPath;
          const imagePath = imageUri.fsPath;
          // path.relative で相対パスを計算し、'..' で始まらないことを確認
          const relativePath = path.relative(folderPath, imagePath);
          // 相対パスが '..' で始まる場合、または絶対パス（Windows のドライブレター）の場合は外部
          return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
        });
        
        if (!isWithinWorkspace) {
          logger.warn('Image path traversal blocked - path outside workspace', {
            clientId,
            details: { requestId, src, resolvedPath: imageUri.fsPath },
          });
          await panel.panel.webview.postMessage(
            createImageResolvedMessage(requestId, src, state.sessionId)
          );
          return;
        }
      }

      logger.debug('Resolving workspace image', {
        clientId,
        details: { requestId, src, imageUri: imageUri.toString() },
      });

      // Convert to webview URI
      const webviewUri = panel.panel.webview.asWebviewUri(imageUri);

      logger.info('Image resolved to webview URI', {
        clientId,
        details: { requestId, src, resolvedSrc: webviewUri.toString() },
      });

      await panel.panel.webview.postMessage(
        createImageResolvedMessage(requestId, webviewUri.toString(), state.sessionId)
      );
    } catch (error) {
      logger.error('Failed to resolve image', {
        clientId,
        errorCode: 'IMAGE_RESOLVE_FAILED',
        errorStack: String(error),
        details: { requestId, src },
      });

      // Return original src on error
      await panel.panel.webview.postMessage(
        createImageResolvedMessage(requestId, src, state.sessionId)
      );
    }
  }

  private async safeStat(uri: vscode.Uri): Promise<vscode.FileStat | null> {
    try {
      return await vscode.workspace.fs.stat(uri);
    } catch {
      return null;
    }
  }

  private createAutoNestedPageBaseName(): string {
    const now = new Date();
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const ms = pad(now.getMilliseconds(), 3);
    return `page-${y}${m}${d}-${hh}${mm}${ss}-${ms}`;
  }

  private async handleCreateNestedPage(
    document: vscode.TextDocument,
    state: DocumentState,
    panel: WebviewPanel,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'createNestedPage' }
  ): Promise<void> {
    const startedAt = Date.now();
    const { requestId, title } = msg;
    const docUri = document.uri.toString();

    const withTimeout = async <T>(label: string, promise: PromiseLike<T>, timeoutMs: number): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`timeout:${label}`));
          }, timeoutMs);
        });
        return await Promise.race([Promise.resolve(promise), timeoutPromise]);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    const fsTimeoutMs = 3000;

    const postToPanel = (target: WebviewPanel, context: string, payload: unknown) => {
      const timeoutMs = 1000;
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          logger.warn('Nested page response delivery timeout', {
            clientId: target.clientId,
            docUri,
            details: { requestId, context, timeoutMs },
          });
        }
      }, timeoutMs);

      logger.info('Nested page response send attempt', {
        clientId: target.clientId,
        docUri,
        details: {
          requestId,
          context,
          panelReady: target.ready,
          panelVisible: target.panel.visible,
          panelActive: target.panel.active,
          panelTitle: target.panel.title,
        },
      });

      try {
        Promise.resolve(target.panel.webview.postMessage(payload))
          .then((delivered) => {
            settled = true;
            clearTimeout(timeoutId);
            if (!delivered) {
              logger.warn('Nested page response not delivered', {
                clientId: target.clientId,
                docUri,
                details: { requestId, context },
              });
            } else {
              logger.info('Nested page response delivered', {
                clientId: target.clientId,
                docUri,
                details: { requestId, context },
              });
            }
          })
          .catch((error) => {
            settled = true;
            clearTimeout(timeoutId);
            logger.error('Nested page response post failed', {
              clientId: target.clientId,
              docUri,
              details: { requestId, context, error: String(error) },
            });
          });
      } catch (error) {
        settled = true;
        clearTimeout(timeoutId);
        logger.error('Nested page response post threw', {
          clientId: target.clientId,
          docUri,
          details: { requestId, context, error: String(error) },
        });
      }
    };

    const postToRequestingPanel = (context: string, payload: unknown): boolean => {
      if (!panel.ready) {
        logger.error('Nested page response blocked: panel not ready', {
          clientId: panel.clientId,
          docUri,
          details: { requestId, context },
        });
        return false;
      }
      if (state.panels.get(panel.clientId) !== panel) {
        logger.error('Nested page response blocked: panel disposed', {
          clientId: panel.clientId,
          docUri,
          details: { requestId, context },
        });
        return false;
      }
      postToPanel(panel, context, payload);
      return true;
    };

    logger.warn('Nested page create requested', {
      clientId,
      docUri,
      details: { requestId, title },
    });

    postToRequestingPanel('nestedPageCreateAck', createNestedPageCreateAckMessage(requestId, state.sessionId));

    const fail = (message: string, code: string, details?: Record<string, unknown>) => {
      logger.error('Nested page create failed', {
        clientId,
        docUri,
        errorCode: code,
        errorStack: message,
        details: { requestId, title, durationMs: Date.now() - startedAt, ...(details || {}) },
      });
      postToRequestingPanel(
        'nestedPageCreateFailed',
        createNestedPageCreateFailedMessage(requestId, message, state.sessionId, code, details)
      );
    };

    try {
      if (document.uri.scheme !== 'file') {
        fail('Only file-based documents are supported', 'NESTED_PAGE_UNSUPPORTED_SCHEME', {
          scheme: document.uri.scheme,
        });
        return;
      }

      const trimmedTitle = title.trim();
      const displayTitle = trimmedTitle ? trimmedTitle.replace(/\.md$/i, '').trim() : 'New Page';

      const docInfo = path.parse(document.uri.fsPath);
      const docBaseName = docInfo.name;
      const docExt = docInfo.ext || '.md';
      if (!docBaseName) {
        fail('Document name is empty', 'NESTED_PAGE_INVALID_DOCUMENT');
        return;
      }

      const parentDir = path.dirname(document.uri.fsPath);
      const parentDirName = path.basename(parentDir);
      const needsRelocate = parentDirName !== docBaseName;
      const baseFolderUri = needsRelocate
        ? vscode.Uri.file(path.join(parentDir, docBaseName))
        : vscode.Uri.file(parentDir);

      if (needsRelocate) {
        try {
          const folderStat = await withTimeout('stat-base-folder', this.safeStat(baseFolderUri), fsTimeoutMs);
          if (folderStat && folderStat.type !== vscode.FileType.Directory) {
            fail('Target folder exists and is not a directory', 'NESTED_PAGE_FOLDER_INVALID', {
              folderPath: baseFolderUri.fsPath,
            });
            return;
          }
          if (!folderStat) {
            await withTimeout('create-base-folder', vscode.workspace.fs.createDirectory(baseFolderUri), fsTimeoutMs);
          }
        } catch (error) {
          fail('Failed to create target folder', 'NESTED_PAGE_FOLDER_CREATE_FAILED', {
            folderPath: baseFolderUri.fsPath,
            error: String(error),
          });
          return;
        }

        try {
          if (document.isDirty) {
            const saved = await withTimeout('save-doc', document.save(), fsTimeoutMs);
            if (!saved) {
              fail('Failed to save document before move', 'NESTED_PAGE_DOC_SAVE_FAILED');
              return;
            }
          }
        } catch (error) {
          fail('Failed to save document before move', 'NESTED_PAGE_DOC_SAVE_FAILED', {
            error: String(error),
          });
          return;
        }

        const relocatedDocUri = vscode.Uri.file(path.join(baseFolderUri.fsPath, `${docBaseName}${docExt}`));
        try {
          const existingDoc = await withTimeout('stat-move-target', this.safeStat(relocatedDocUri), fsTimeoutMs);
          if (existingDoc) {
            fail('Target document already exists', 'NESTED_PAGE_DOC_MOVE_TARGET_EXISTS', {
              filePath: relocatedDocUri.fsPath,
            });
            return;
          }
        } catch (error) {
          fail('Failed to stat target document', 'NESTED_PAGE_DOC_MOVE_TARGET_STAT_FAILED', {
            filePath: relocatedDocUri.fsPath,
            error: String(error),
          });
          return;
        }

        try {
          await withTimeout(
            'move-doc',
            vscode.workspace.fs.rename(document.uri, relocatedDocUri, { overwrite: false }),
            fsTimeoutMs
          );
          logger.info('Nested page source document moved', {
            clientId,
            docUri,
            details: {
              requestId,
              from: document.uri.fsPath,
              to: relocatedDocUri.fsPath,
            },
          });
        } catch (error) {
          fail('Failed to move document into folder', 'NESTED_PAGE_DOC_MOVE_FAILED', {
            from: document.uri.fsPath,
            to: relocatedDocUri.fsPath,
            error: String(error),
          });
          return;
        }
      }

      const childrenFolderUri = vscode.Uri.file(path.join(baseFolderUri.fsPath, '_children'));
      try {
        const childrenStat = await withTimeout(
          'stat-children-folder',
          this.safeStat(childrenFolderUri),
          fsTimeoutMs
        );
        if (childrenStat && childrenStat.type !== vscode.FileType.Directory) {
          fail('Children folder exists and is not a directory', 'NESTED_PAGE_CHILDREN_FOLDER_INVALID', {
            folderPath: childrenFolderUri.fsPath,
          });
          return;
        }
        if (!childrenStat) {
          await withTimeout(
            'create-children-folder',
            vscode.workspace.fs.createDirectory(childrenFolderUri),
            fsTimeoutMs
          );
        }
      } catch (error) {
        fail('Failed to create children folder', 'NESTED_PAGE_CHILDREN_FOLDER_CREATE_FAILED', {
          folderPath: childrenFolderUri.fsPath,
          error: String(error),
        });
        return;
      }

      const fileBaseName = this.createAutoNestedPageBaseName();
      const fileName = `${fileBaseName}.md`;
      const targetFileUri = vscode.Uri.joinPath(childrenFolderUri, fileName);

      try {
        const existing = await withTimeout('stat-file', this.safeStat(targetFileUri), fsTimeoutMs);
        if (existing) {
          fail('Target file already exists', 'NESTED_PAGE_FILE_EXISTS', {
            filePath: targetFileUri.fsPath,
          });
          return;
        }
      } catch (error) {
        fail('Failed to stat target file', 'NESTED_PAGE_FILE_STAT_FAILED', {
          filePath: targetFileUri.fsPath,
          error: String(error),
        });
        return;
      }

      const tmpFileUri = vscode.Uri.joinPath(childrenFolderUri, `.tmp.inlineMark.${requestId}.md`);
      try {
        await withTimeout('write-temp', vscode.workspace.fs.writeFile(tmpFileUri, new TextEncoder().encode('')), fsTimeoutMs);
        await withTimeout('rename-temp', vscode.workspace.fs.rename(tmpFileUri, targetFileUri, { overwrite: false }), fsTimeoutMs);
      } catch (error) {
        try {
          await withTimeout('cleanup-temp', vscode.workspace.fs.delete(tmpFileUri), fsTimeoutMs);
        } catch (cleanupError) {
          logger.warn('Nested page temp cleanup failed', {
            clientId,
            details: { requestId, error: String(cleanupError) },
          });
        }
        fail('Failed to create nested page file', 'NESTED_PAGE_FILE_CREATE_FAILED', {
          filePath: targetFileUri.fsPath,
          error: String(error),
        });
        return;
      }

      const relativePath = path
        .relative(baseFolderUri.fsPath, targetFileUri.fsPath)
        .replace(/\\/g, '/');

      const delivered = postToRequestingPanel(
        'nestedPageCreated',
        createNestedPageCreatedMessage(requestId, displayTitle, relativePath, state.sessionId)
      );

      if (!delivered) {
        try {
          const viewColumn =
            panel.panel.viewColumn ??
            vscode.window.activeTextEditor?.viewColumn ??
            vscode.window.tabGroups.activeTabGroup.viewColumn;
          const options = viewColumn ? { viewColumn, preview: false } : { preview: false };
          await vscode.commands.executeCommand('vscode.openWith', targetFileUri, InlineMarkProvider.viewType, options);
          logger.info('Nested page opened by extension', {
            clientId,
            docUri,
            details: {
              requestId,
              path: targetFileUri.fsPath,
              reason: 'panel-unavailable',
            },
          });
        } catch (error) {
          logger.error('Nested page open failed (extension)', {
            clientId,
            docUri,
            errorCode: 'NESTED_PAGE_OPEN_FAILED',
            errorStack: String(error),
            details: { requestId, path: targetFileUri.fsPath },
          });
        }
      }

      logger.info('Nested page created', {
        clientId,
        docUri,
        details: {
          requestId,
          title: displayTitle,
          path: relativePath,
          moved: needsRelocate,
          baseFolder: baseFolderUri.fsPath,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      fail('Nested page create unexpected error', 'NESTED_PAGE_CREATE_UNEXPECTED', {
        error: String(error),
      });
    }
  }

  private async handleOpenNestedPage(
    document: vscode.TextDocument,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'openNestedPage' }
  ): Promise<void> {
    const { path: relativePath } = msg;
    const docUri = document.uri.toString();

    logger.info('Nested page open requested', {
      clientId,
      docUri,
      details: { path: relativePath },
    });

    if (!relativePath || typeof relativePath !== 'string') {
      vscode.window.showErrorMessage('Nested page path is missing.');
      logger.error('Nested page open failed: missing path', { clientId, docUri });
      return;
    }

    if (document.uri.scheme !== 'file') {
      vscode.window.showErrorMessage('Only file-based documents are supported.');
      logger.error('Nested page open failed: unsupported scheme', {
        clientId,
        docUri,
        details: { scheme: document.uri.scheme },
      });
      return;
    }

    const baseDir = path.dirname(document.uri.fsPath);
    const targetPath = path.resolve(baseDir, relativePath);
    const targetUri = vscode.Uri.file(targetPath);

    const exists = await this.safeStat(targetUri);
    if (!exists || exists.type !== vscode.FileType.File) {
      vscode.window.showErrorMessage(`Nested page not found: ${relativePath}`);
      logger.error('Nested page open failed: file missing', {
        clientId,
        docUri,
        details: { targetPath },
      });
      return;
    }

    try {
      const viewColumn =
        vscode.window.activeTextEditor?.viewColumn ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
      await vscode.commands.executeCommand('vscode.openWith', targetUri, InlineMarkProvider.viewType, {
        viewColumn,
        preview: false,
      });
      logger.info('Nested page opened', {
        clientId,
        docUri,
        details: { targetPath },
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open nested page: ${relativePath}`);
      logger.error('Nested page open failed', {
        clientId,
        docUri,
        errorCode: 'NESTED_PAGE_OPEN_FAILED',
        errorStack: String(error),
      });
    }
  }

  private async handleNotifyHost(
    document: vscode.TextDocument,
    state: DocumentState,
    panel: WebviewPanel,
    clientId: string,
    msg: WebviewToExtensionMessage & { type: 'notifyHost' }
  ): Promise<void> {
    const { level, code, message, remediation, details } = msg;

    logger.info('notifyHost received', {
      clientId,
      docUri: document.uri.toString(),
      details: {
        level,
        code,
        remediation,
        ...(details ? { details } : {}),
      },
    });

    const actionLabelByRemediation: Partial<Record<string, string>> = {
      resync: vscode.l10n.t('Resync'),
      resetSession: vscode.l10n.t('Reset Session'),
      reopenWithTextEditor: vscode.l10n.t('Open without inlineMark'),
      applySettings: vscode.l10n.t('Apply Settings'),
      trustWorkspace: vscode.l10n.t('Trust Workspace'),
    };

    const actions = remediation
      .map((r) => ({
        remediation: r,
        label: actionLabelByRemediation[r] ?? r,
      }))
      .filter((a) => a.label);

    const show =
      level === 'ERROR'
        ? vscode.window.showErrorMessage
        : level === 'WARN'
          ? vscode.window.showWarningMessage
          : vscode.window.showInformationMessage;

    const title = code ? `[${code}] ${message}` : message;
    const picked = actions.length > 0 ? await show(title, ...actions.map((a) => a.label)) : await show(title);
    if (!picked) {return;}

    const selected = actions.find((a) => a.label === picked)?.remediation;
    if (!selected) {return;}

    switch (selected) {
      case 'resync':
        // Destructive action → confirm in extension UI.
        await this.handleRequestResyncWithConfirm(document, state, panel, clientId);
        break;
      case 'resetSession':
        await this.resetSession(document);
        break;
      case 'reopenWithTextEditor':
        await this.handleReopenWithTextEditor(clientId);
        break;
      case 'applySettings':
        await this.applyRequiredSettings();
        break;
      case 'trustWorkspace':
        await vscode.commands.executeCommand('workbench.trust.manage');
        break;
    }
  }

  private onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
    const docKey = e.document.uri.toString();
    const state = this.documentStates.get(docKey);

    if (!state) {return;}

    const changes = contentChangeEventsToReplaces(e.document, e.contentChanges);

    const selfClientId = state.selfChangeVersions.get(e.document.version);
    if (selfClientId) {
      state.selfChangeVersions.delete(e.document.version);
    }

    for (const [, panel] of state.panels) {
      if (panel.ready) {
        const reason = panel.clientId === selfClientId ? 'self' : 'external';
        const docChangedMessage = createDocChangedMessage(
          e.document.version,
          reason,
          changes,
          state.sessionId
        );
        panel.panel.webview.postMessage(docChangedMessage);
      }
    }

    logger.debug('docChanged broadcast', {
      sessionId: state.sessionId,
      docUri: docKey,
      docVersion: e.document.version,
      changesCount: changes.length,
      details: { panelCount: state.panels.size, selfClientId: selfClientId ?? null },
    });
  }

  private getWebviewConfig(): WebviewConfig {
    const syncConfig = vscode.workspace.getConfiguration('inlineMark.sync');
    const securityConfig = vscode.workspace.getConfiguration('inlineMark.security');
    const debugConfig = vscode.workspace.getConfiguration('inlineMark.debug');
    const viewConfig = vscode.workspace.getConfiguration('inlineMark.view');
    const editorConfig = vscode.workspace.getConfiguration('editor', { languageId: 'markdown' });
    const wordWrap = editorConfig.get<string>('wordWrap', 'off');
    const noWrapInspect = viewConfig.inspect<boolean | null>('noWrap');
    const explicitNoWrap =
      noWrapInspect?.workspaceValue ??
      noWrapInspect?.workspaceFolderValue ??
      noWrapInspect?.globalValue;
    const resolvedNoWrap = typeof explicitNoWrap === 'boolean' ? explicitNoWrap : wordWrap === 'off';

    return {
      debounceMs: syncConfig.get<number>('debounceMs', 250),
      timeoutMs: syncConfig.get<number>('timeoutMs', 3000),
      changeGuard: {
        maxChangedRatio: syncConfig.get<number>('changeGuard.maxChangedRatio', 0.5),
        maxChangedChars: syncConfig.get<number>('changeGuard.maxChangedChars', 50000),
        maxHunks: syncConfig.get<number>('changeGuard.maxHunks', 200),
      },
      view: {
        fullWidth: viewConfig.get<boolean>('fullWidth', true),
        noWrap: resolvedNoWrap,
      },
      security: {
        allowWorkspaceImages: securityConfig.get<boolean>('allowWorkspaceImages', true),
        allowRemoteImages: securityConfig.get<boolean>('allowRemoteImages', false),
        allowInsecureRemoteImages: securityConfig.get<boolean>('allowInsecureRemoteImages', false),
        confirmExternalLinks: securityConfig.get<boolean>('confirmExternalLinks', true),
      },
      debug: {
        enabled: debugConfig.get<boolean>('enabled', false),
      },
    };
  }

  private getChangeGuardConfig(): {
    maxChangedRatio: number;
    maxChangedChars: number;
    maxHunks: number;
  } {
    const config = vscode.workspace.getConfiguration('inlineMark.sync.changeGuard');
    return {
      maxChangedRatio: config.get<number>('maxChangedRatio', 0.5),
      maxChangedChars: config.get<number>('maxChangedChars', 50000),
      maxHunks: config.get<number>('maxHunks', 200),
    };
  }

  private async loadI18nBundle(locale: string): Promise<Record<string, string>> {
    const bundlePath = vscode.Uri.joinPath(
      this.extensionUri,
      'l10n',
      `bundle.l10n.${locale}.json`
    );

    try {
      const content = await vscode.workspace.fs.readFile(bundlePath);
      return JSON.parse(Buffer.from(content).toString('utf-8'));
    } catch {
      const defaultBundlePath = vscode.Uri.joinPath(this.extensionUri, 'l10n', 'bundle.l10n.json');
      try {
        const content = await vscode.workspace.fs.readFile(defaultBundlePath);
        return JSON.parse(Buffer.from(content).toString('utf-8'));
      } catch {
        return {};
      }
    }
  }

  private async checkRequiredSettings(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('', { languageId: 'markdown' });

    for (const [key, expectedValue] of Object.entries(REQUIRED_MARKDOWN_SETTINGS)) {
      const value = config.get(key);
      if (typeof expectedValue === 'object') {
        if (JSON.stringify(value) !== JSON.stringify(expectedValue)) {
          return false;
        }
      } else if (value !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  private async showSettingsRequiredDialog(): Promise<boolean> {
    const applyButton = vscode.l10n.t('Apply Settings');
    const openSettingsButton = vscode.l10n.t('Open Settings');
    const cancelButton = vscode.l10n.t('Cancel');

    // Get current values for comparison
    const config = vscode.workspace.getConfiguration('', { languageId: 'markdown' });
    const settingsDescription = Object.entries(REQUIRED_MARKDOWN_SETTINGS)
      .map(([key, expectedValue]) => {
        const currentValue = config.get(key);
        const currentStr = JSON.stringify(currentValue);
        const expectedStr = JSON.stringify(expectedValue);
        return `  ${key}: ${currentStr} → ${expectedStr}`;
      })
      .join('\n');

    logger.debug('Showing settings required dialog', {
      details: { settingsDescription },
    });

    const message = vscode.l10n.t('Required Markdown settings are not configured. The editor cannot start.');
    const detail = vscode.l10n.t('The following settings will be changed (current → required):') + '\n' + settingsDescription;

    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true, detail },
      applyButton,
      openSettingsButton,
      cancelButton
    );

    if (result === applyButton) {
      return await this.applyRequiredSettings();
    } else if (result === openSettingsButton) {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@lang:markdown editor.formatOnSave'
      );
      return false;
    }

    return false;
  }

  public async applyRequiredSettings(): Promise<boolean> {
    try {
      const config = vscode.workspace.getConfiguration('', { languageId: 'markdown' });

      for (const [key, value] of Object.entries(REQUIRED_MARKDOWN_SETTINGS)) {
        await config.update(key, value, vscode.ConfigurationTarget.Workspace);
      }

      vscode.window.showInformationMessage(vscode.l10n.t('Settings applied successfully.'));
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to apply settings: {0}', String(error))
      );
      return false;
    }
  }

  private async showUntrustedWorkspaceError(webviewPanel: vscode.WebviewPanel, sessionId?: string): Promise<void> {
    const errorMessage = createErrorMessage(
      'WORKSPACE_UNTRUSTED',
      vscode.l10n.t('Workspace is not trusted. Please trust the workspace to use this editor.'),
      ['trustWorkspace', 'reopenWithTextEditor'],
      sessionId
    );

    webviewPanel.webview.html = this.getErrorHtml(errorMessage.message);
  }

  private async showSettingsNotConfiguredError(webviewPanel: vscode.WebviewPanel, sessionId?: string): Promise<void> {
    const errorMessage = createErrorMessage(
      'SETTINGS_NOT_CONFIGURED',
      vscode.l10n.t('Required Markdown settings are not configured. The editor cannot start.'),
      ['applySettings', 'reopenWithTextEditor'],
      sessionId
    );

    webviewPanel.webview.html = this.getErrorHtml(errorMessage.message);
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Error</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .error-container {
      text-align: center;
      max-width: 500px;
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .error-message {
      font-size: 14px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">!</div>
    <div class="error-message">${this.escapeHtml(message)}</div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public async resetSession(document: vscode.TextDocument, skipConfirmation = false): Promise<boolean> {
    const docKey = document.uri.toString();
    const state = this.documentStates.get(docKey);

    if (!state) {return false;}

    // Show confirmation dialog for destructive operation (spec 12.1.1)
    if (!skipConfirmation) {
      const confirmButton = vscode.l10n.t('Reset Session');
      const cancelButton = vscode.l10n.t('Cancel');
      const result = await vscode.window.showWarningMessage(
        vscode.l10n.t('This will reset the editor session and discard any unsaved changes in the editor. Are you sure?'),
        { modal: true },
        confirmButton,
        cancelButton
      );

      if (result !== confirmButton) {
        logger.debug('Session reset cancelled by user', { docUri: docKey });
        return false;
      }
    }

    state.sessionId = crypto.randomUUID();
    state.selfChangeVersions.clear();

    for (const [, panel] of state.panels) {
      panel.ready = false;
      const config = this.getWebviewConfig();
      const locale = vscode.env.language;
      const i18n = await this.loadI18nBundle(locale);

      const initMessage = createInitMessage(
        document.version,
        document.getText(),
        state.sessionId,
        panel.clientId,
        locale,
        i18n,
        config
      );

      await panel.panel.webview.postMessage(initMessage);
      panel.ready = true;
    }

    vscode.window.showInformationMessage(vscode.l10n.t('Editor session has been reset.'));
    logger.info('Session reset', { sessionId: state.sessionId, docUri: docKey });
    return true;
  }

  /**
   * エディタコマンドをアクティブなWebviewに送信
   * VSCode keybindingsから呼び出される
   */
  public sendEditorCommand(command: string): void {
    // 現在アクティブなタブからWebviewパネルを取得
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!activeTab) {
      logger.debug('sendEditorCommand: no active tab', { details: { command } });
      return;
    }

    const input = activeTab.input;
    if (!(input instanceof vscode.TabInputCustom) || input.viewType !== InlineMarkProvider.viewType) {
      logger.debug('sendEditorCommand: active tab is not inlineMark editor', { details: { command } });
      return;
    }

    // DocumentStateからパネルを探す
    const docKey = input.uri.toString();
    const state = this.documentStates.get(docKey);
    if (!state) {
      logger.debug('sendEditorCommand: no document state', { docUri: docKey, details: { command } });
      return;
    }

    // 全パネルにコマンドを送信（通常は1つ）
    for (const [, panel] of state.panels) {
      if (panel.ready) {
        panel.panel.webview.postMessage({
          type: 'editorCommand',
          command,
        });
        logger.debug('sendEditorCommand: sent', { clientId: panel.clientId, details: { command } });
      }
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
