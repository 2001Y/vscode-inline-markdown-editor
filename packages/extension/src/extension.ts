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
 * - inlineMarkdownEditor.resetSession: セッションをリセット（破壊的操作、確認必須）
 * - inlineMarkdownEditor.applyRequiredSettings: 必須設定を適用
 * - inlineMarkdownEditor.exportLogs: ログをエクスポート
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
