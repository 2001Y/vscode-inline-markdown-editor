/**
 * Role: CustomTextEditorProvider implementation for Markdown files
 * Responsibility: Manage Webview lifecycle, handle message passing, coordinate document sync
 * Invariant: TextDocument is the single source of truth; all Webviews must converge to the same state
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  type WebviewToExtensionMessage,
  type WebviewConfig,
  createInitMessage,
  createAckMessage,
  createNackMessage,
  createDocChangedMessage,
  createErrorMessage,
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
  pendingEdits: Map<number, { clientId: string; baseVersion: number }>;
}

const REQUIRED_MARKDOWN_SETTINGS = {
  'editor.formatOnSave': false,
  'editor.formatOnType': false,
  'editor.formatOnPaste': false,
  'editor.codeActionsOnSave': {},
  'files.trimTrailingWhitespace': false,
  'files.insertFinalNewline': false,
};

export class InlineMarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'inlineMarkdownEditor.editor';

  private documentStates = new Map<string, DocumentState>();
  private extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionUri = context.extensionUri;

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDidChangeTextDocument(e))
    );
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new InlineMarkdownEditorProvider(context);

    const providerRegistration = vscode.window.registerCustomEditorProvider(
      InlineMarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: false,
        },
        supportsMultipleEditorsPerDocument: true,
      }
    );

    context.subscriptions.push(providerRegistration);
    context.subscriptions.push(provider);

    return providerRegistration;
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
        pendingEdits: new Map(),
      };
      this.documentStates.set(docKey, state);
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
    const config = vscode.workspace.getConfiguration('inlineMarkdownEditor.security');
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

    let manifestData: { 'index.js'?: { file: string }; 'index.css'?: { file: string } } = {};
    try {
      const manifestPath = vscode.Uri.joinPath(mediaPath, '.vite', 'manifest.json');
      const manifestContent = await vscode.workspace.fs.readFile(manifestPath);
      manifestData = JSON.parse(Buffer.from(manifestContent).toString('utf-8'));
    } catch {
      manifestData = {
        'index.js': { file: 'index.js' },
        'index.css': { file: 'index.css' },
      };
    }

    const scriptFile = manifestData['index.js']?.file || 'index.js';
    const styleFile = manifestData['index.css']?.file || 'index.css';

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, scriptFile));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, styleFile));

    const csp = this.buildCsp(webview, nonce);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Inline Markdown Editor</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private buildCsp(webview: vscode.Webview, nonce: string): string {
    const config = vscode.workspace.getConfiguration('inlineMarkdownEditor.security');
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
        await this.handleResolveImage(document, panel, clientId, msg);
        break;
    }
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

    state.pendingEdits.set(txId, { clientId, baseVersion });

    try {
      const workspaceEdit = replacesToWorkspaceEdit(document, changes);
      const success = await vscode.workspace.applyEdit(workspaceEdit);

      if (success) {
        const ackMessage = createAckMessage(txId, document.version, 'applied', state.sessionId);
        await panel.panel.webview.postMessage(ackMessage);

        logger.info('Edit applied', {
          clientId,
          txId,
          docVersion: document.version,
          changesCount: changes.length,
        });
      } else {
        const nackMessage = createNackMessage(txId, document.version, 'applyFailed', state.sessionId);
        await panel.panel.webview.postMessage(nackMessage);

        logger.error('Edit apply failed', { clientId, txId, docVersion: document.version });
      }
    } catch (error) {
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
    } finally {
      state.pendingEdits.delete(txId);
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
    const config = vscode.workspace.getConfiguration('inlineMarkdownEditor.debug');
    if (!config.get<boolean>('logging', false)) return;

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
    const securityConfig = vscode.workspace.getConfiguration('inlineMarkdownEditor.security');
    const confirmExternalLinks = securityConfig.get<boolean>('confirmExternalLinks', true);

    if (confirmExternalLinks) {
      const openButton = vscode.l10n.t('Open');
      const cancelButton = vscode.l10n.t('Cancel');
      
      logger.debug('Showing external link confirmation dialog', { clientId, details: { url } });
      
      const result = await vscode.window.showInformationMessage(
        vscode.l10n.t('Do you want to open this external link?\n{0}', url),
        { modal: true },
        openButton,
        cancelButton
      );

      if (result !== openButton) {
        logger.info('External link opening cancelled by user', { clientId, details: { url } });
        return;
      }
    }

    // Open the link using VS Code's openExternal
    try {
      const uri = vscode.Uri.parse(url);
      await vscode.env.openExternal(uri);
      logger.info('External link opened', { clientId, details: { url } });
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
      await vscode.commands.executeCommand('inlineMarkdownEditor.exportLogs');
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
    const securityConfig = vscode.workspace.getConfiguration('inlineMarkdownEditor.security');
    const allowWorkspaceImages = securityConfig.get<boolean>('allowWorkspaceImages', true);

    if (!allowWorkspaceImages) {
      logger.info('Workspace images not allowed - returning original src', {
        clientId,
        details: { requestId, src },
      });
      await panel.panel.webview.postMessage({
        type: 'imageResolved',
        requestId,
        resolvedSrc: src,
      });
      return;
    }

    // Check if it's a relative path
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      logger.debug('Image is remote or data URL - returning original src', {
        clientId,
        details: { requestId, src },
      });
      await panel.panel.webview.postMessage({
        type: 'imageResolved',
        requestId,
        resolvedSrc: src,
      });
      return;
    }

    try {
      // Resolve relative path against document directory
      const documentDir = vscode.Uri.joinPath(document.uri, '..');
      const imageUri = vscode.Uri.joinPath(documentDir, src);

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

      await panel.panel.webview.postMessage({
        type: 'imageResolved',
        requestId,
        resolvedSrc: webviewUri.toString(),
      });
    } catch (error) {
      logger.error('Failed to resolve image', {
        clientId,
        errorCode: 'IMAGE_RESOLVE_FAILED',
        errorStack: String(error),
        details: { requestId, src },
      });

      // Return original src on error
      await panel.panel.webview.postMessage({
        type: 'imageResolved',
        requestId,
        resolvedSrc: src,
      });
    }
  }

  private onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
    const docKey = e.document.uri.toString();
    const state = this.documentStates.get(docKey);

    if (!state) return;

    const changes = contentChangeEventsToReplaces(e.document, e.contentChanges);

    const docChangedMessage = createDocChangedMessage(
      e.document.version,
      'external',
      changes,
      state.sessionId
    );

    for (const [, panel] of state.panels) {
      if (panel.ready) {
        panel.panel.webview.postMessage(docChangedMessage);
      }
    }

    logger.debug('docChanged broadcast', {
      sessionId: state.sessionId,
      docUri: docKey,
      docVersion: e.document.version,
      changesCount: changes.length,
      details: { panelCount: state.panels.size },
    });
  }

  private getWebviewConfig(): WebviewConfig {
    const syncConfig = vscode.workspace.getConfiguration('inlineMarkdownEditor.sync');
    const securityConfig = vscode.workspace.getConfiguration('inlineMarkdownEditor.security');
    const debugConfig = vscode.workspace.getConfiguration('inlineMarkdownEditor.debug');

    return {
      debounceMs: syncConfig.get<number>('debounceMs', 250),
      timeoutMs: syncConfig.get<number>('timeoutMs', 3000),
      changeGuard: {
        maxChangedRatio: syncConfig.get<number>('changeGuard.maxChangedRatio', 0.5),
        maxChangedChars: syncConfig.get<number>('changeGuard.maxChangedChars', 50000),
        maxHunks: syncConfig.get<number>('changeGuard.maxHunks', 200),
      },
      security: {
        allowWorkspaceImages: securityConfig.get<boolean>('allowWorkspaceImages', true),
        allowRemoteImages: securityConfig.get<boolean>('allowRemoteImages', false),
        allowInsecureRemoteImages: securityConfig.get<boolean>('allowInsecureRemoteImages', false),
        renderHtml: securityConfig.get<boolean>('renderHtml', false),
        confirmExternalLinks: securityConfig.get<boolean>('confirmExternalLinks', true),
      },
      debug: {
        logging: debugConfig.get<boolean>('logging', false),
        logLevel: debugConfig.get<string>('logLevel', 'INFO'),
      },
    };
  }

  private getChangeGuardConfig(): {
    maxChangedRatio: number;
    maxChangedChars: number;
    maxHunks: number;
  } {
    const config = vscode.workspace.getConfiguration('inlineMarkdownEditor.sync.changeGuard');
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

    if (!state) return false;

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
    state.pendingEdits.clear();

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

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
