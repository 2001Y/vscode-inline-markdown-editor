/**
 * 役割: 拡張機能のエントリーポイント
 * 責務: Provider登録、コマンド登録、ロギング初期化
 * 不変条件: 拡張機能は適切にactivate/deactivateされること
 *
 * 設計書参照: 6.2 (extension.ts の責務)
 *
 * この拡張機能は CustomTextEditorProvider を使用して .md ファイルを
 * Tiptap ベースの WYSIWYG エディタで開く。TextDocument が唯一の真実
 * (source of truth) であり、Webview は表示と入力を担当する。
 *
 * コマンド一覧 (設計書 17.2):
 * - inlineMark.resetSession: セッションをリセット（破壊的操作、確認必須）
 * - inlineMark.applyRequiredSettings: 必須設定を適用
 * - inlineMark.exportLogs: ログをエクスポート
 */

import * as vscode from 'vscode';
import { InlineMarkProvider } from './editors/inlineMarkProvider.js';
import { logger } from './util/log.js';

export function activate(context: vscode.ExtensionContext): void {
  logger.initialize(context);
  logger.info('Extension activating');

  InlineMarkProvider.register(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.resetSession', async () => {
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
    vscode.commands.registerCommand('inlineMark.reopenWithTextEditor', async () => {
      // Preferred (best UX): in-place reopen (workbench command)
      try {
        await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        return;
      } catch (error) {
        logger.warn('workbench.action.reopenTextEditor failed; falling back to vscode.openWith', {
          errorCode: 'REOPEN_TEXT_EDITOR_FAILED',
          errorStack: String(error),
        });
      }

      // Fallback (API command): force built-in text editor (viewType = 'default')
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      const input = tab?.input;

      if (input instanceof vscode.TabInputCustom && input.viewType === InlineMarkProvider.viewType) {
        const uri = input.uri;
        const viewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
        await vscode.commands.executeCommand('vscode.openWith', uri, 'default', { viewColumn });
        return;
      }

      // Fallback of the fallback: if we can't access the tab input, use activeTextEditor when present.
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'default', {
          viewColumn: editor.viewColumn,
        });
        return;
      }

      vscode.window.showWarningMessage(
        vscode.l10n.t('Cannot reopen with Text Editor: no active editor found.')
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.applyRequiredSettings', async () => {
      const provider = getProvider(context);
      if (provider) {
        await provider.applyRequiredSettings();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.exportLogs', async () => {
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

let providerInstance: InlineMarkProvider | undefined;

function getProvider(context: vscode.ExtensionContext): InlineMarkProvider | undefined {
  if (!providerInstance) {
    providerInstance = new InlineMarkProvider(context);
  }
  return providerInstance;
}
