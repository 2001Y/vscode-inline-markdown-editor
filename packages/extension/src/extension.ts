/**
 * Role: Extension entry point
 * Responsibility: Register providers, commands, and initialize logging
 * Invariant: Extension must be properly activated and deactivated
 */

import * as vscode from 'vscode';
import { InlineMarkdownEditorProvider } from './editors/inlineMarkdownEditorProvider.js';
import { logger } from './util/log.js';

export function activate(context: vscode.ExtensionContext): void {
  logger.initialize(context);
  logger.info('Extension activating');

  InlineMarkdownEditorProvider.register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMarkdownEditor.resetSession', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        const provider = getProvider(context);
        if (provider) {
          await provider.resetSession(editor.document);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMarkdownEditor.applyRequiredSettings', async () => {
      const provider = getProvider(context);
      if (provider) {
        await provider.applyRequiredSettings();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMarkdownEditor.exportLogs', async () => {
      const exportPath = await logger.exportLogs();
      if (exportPath) {
        vscode.window.showInformationMessage(
          vscode.l10n.t('Logs exported to: {0}', exportPath)
        );
      } else {
        vscode.window.showInformationMessage(vscode.l10n.t('No logs to export.'));
      }
    })
  );

  logger.info('Extension activated');
}

export function deactivate(): void {
  logger.info('Extension deactivating');
  logger.dispose();
}

let providerInstance: InlineMarkdownEditorProvider | undefined;

function getProvider(context: vscode.ExtensionContext): InlineMarkdownEditorProvider | undefined {
  if (!providerInstance) {
    providerInstance = new InlineMarkdownEditorProvider(context);
  }
  return providerInstance;
}
