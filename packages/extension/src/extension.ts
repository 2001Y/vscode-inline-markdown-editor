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
import { captureInlineEditorOpenTrace, resolveReopenTargetUri } from './util/inlineEditorOpenTrace.js';
import { logger } from './util/log.js';

let providerInstance: InlineMarkProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  logger.initialize(context);
  logger.info('Extension activating');

  providerInstance = InlineMarkProvider.register(context);
  if (!providerInstance) {
    logger.error('Failed to register InlineMarkProvider', {
      errorCode: 'PROVIDER_REGISTRATION_FAILED',
    });
    vscode.window.showErrorMessage(
      vscode.l10n.t('InlineMark extension failed to activate.')
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.resetSession', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        if (providerInstance) {
          await providerInstance.resetSession(editor.document);
        }
      }
    })
  );

  const closeActiveTab = async (tab: vscode.Tab | undefined): Promise<boolean> => {
    if (!tab) {
      return true;
    }
    try {
      return await vscode.window.tabGroups.close(tab, true);
    } catch (error) {
      logger.warn('Failed to close active tab before reopen', {
        errorCode: 'CLOSE_ACTIVE_TAB_FAILED',
        errorStack: String(error),
      });
      return false;
    }
  };

  const openWithViewType = async (
    uri: vscode.Uri,
    viewType: string,
    viewColumn: vscode.ViewColumn | undefined,
    openTrace?: ReturnType<typeof captureInlineEditorOpenTrace>
  ): Promise<void> => {
    const docUri = uri.toString();
    const startedAt = Date.now();
    logger.info('inlineEditor.open.commandIssued', {
      docUri,
      details: {
        seq: openTrace?.seq ?? null,
        reason: openTrace?.reason ?? null,
        requestedViewType: viewType,
        viewColumn: viewColumn ?? null,
      },
    });
    try {
      const open = () => vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
        viewColumn,
        preview: false,
      });
      if (viewType === InlineMarkProvider.viewType && openTrace && providerInstance) {
        await providerInstance.runWithOpenTrace(openTrace, open);
      } else {
        await open();
      }
      logger.info('inlineEditor.open.commandCompleted', {
        docUri,
        durationMs: Date.now() - startedAt,
        details: {
          seq: openTrace?.seq ?? null,
          reason: openTrace?.reason ?? null,
          requestedViewType: viewType,
        },
      });
    } catch (error) {
      if (viewType === InlineMarkProvider.viewType && openTrace && providerInstance) {
        providerInstance.dropQueuedOpenTrace(uri, openTrace.seq, 'openWithFailed');
      }
      logger.error('inlineEditor.open.commandFailed', {
        docUri,
        durationMs: Date.now() - startedAt,
        errorCode: 'INLINE_EDITOR_OPEN_FAILED',
        errorStack: String(error),
        details: {
          seq: openTrace?.seq ?? null,
          reason: openTrace?.reason ?? null,
          requestedViewType: viewType,
        },
      });
      throw error;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.reopenWithTextEditor', async () => {
      const tabGroup = vscode.window.tabGroups.activeTabGroup;
      const tab = tabGroup.activeTab;
      const viewColumn = tabGroup.viewColumn;
      const input = tab?.input;
      const activeTextEditor = vscode.window.activeTextEditor;

      const uri = resolveReopenTargetUri(input, activeTextEditor, InlineMarkProvider.viewType);

      if (!uri) {
        logger.warn('inlineEditor.reopen.textEditor.noTarget', {
          details: {
            activeTabInputKind: tab?.input ? tab.input.constructor.name : null,
            activeTextEditorUri: activeTextEditor?.document.uri.toString() ?? null,
          },
        });
        vscode.window.showWarningMessage(
          vscode.l10n.t('Cannot reopen with Text Editor: no active editor found.')
        );
        return;
      }

      const closed = await closeActiveTab(tab);
      if (!closed) {
        logger.warn('Reopen with Text Editor aborted: close cancelled', {
          errorCode: 'REOPEN_TEXT_EDITOR_CANCELLED',
        });
        return;
      }

      await openWithViewType(uri, 'default', viewColumn);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.reopenWithInlineMark', async () => {
      const tabGroup = vscode.window.tabGroups.activeTabGroup;
      const tab = tabGroup.activeTab;
      const viewColumn = tabGroup.viewColumn;
      const input = tab?.input;
      const activeTextEditor = vscode.window.activeTextEditor;

      const uri = resolveReopenTargetUri(input, activeTextEditor);

      if (!uri) {
        logger.warn('inlineEditor.open.requestRejected', {
          details: {
            reason: 'no-target-uri',
            sourceCommand: 'inlineMark.reopenWithInlineMark',
            activeTabInputKind: tab?.input ? tab.input.constructor.name : null,
            activeTextEditorUri: activeTextEditor?.document.uri.toString() ?? null,
          },
        });
        vscode.window.showWarningMessage(
          vscode.l10n.t('Cannot reopen with inlineMark: no active editor found.')
        );
        return;
      }

      const openTrace = captureInlineEditorOpenTrace({
        targetUri: uri,
        reason: 'reopenWithInlineMark',
        sourceCommand: 'inlineMark.reopenWithInlineMark',
        requestedViewType: InlineMarkProvider.viewType,
        viewColumn,
        activeTab: tab,
        activeTextEditor,
      });

      logger.info('inlineEditor.open.requestCaptured', {
        docUri: uri.toString(),
        details: {
          ...openTrace,
        },
      });
      if (!openTrace.targetSelection) {
        logger.warn('inlineEditor.open.targetSelectionUnavailable', {
          docUri: uri.toString(),
          details: {
            seq: openTrace.seq,
            reason: openTrace.reason,
            activeTextEditorUri: activeTextEditor?.document.uri.toString() ?? null,
            activeTab: openTrace.activeTab,
          },
        });
      }

      const closed = await closeActiveTab(tab);
      if (!closed) {
        logger.warn('inlineEditor.open.requestAborted', {
          docUri: uri.toString(),
          errorCode: 'REOPEN_INLINE_MARK_CANCELLED',
          details: {
            seq: openTrace.seq,
            reason: openTrace.reason,
            stage: 'closeActiveTab',
          },
        });
        return;
      }

      await openWithViewType(uri, InlineMarkProvider.viewType, viewColumn, openTrace);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('inlineMark.applyRequiredSettings', async () => {
      if (providerInstance) {
        await providerInstance.applyRequiredSettings();
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

  // エディタコマンド: VSCode keybindings → Webview postMessage → Tiptap command
  // コマンド名とTiptapコマンド名のマッピング
  const editorCommands = [
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
    'indentListItem',
    'outdentListItem',
    'undo',
    'redo',
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
  ];

  // 全エディタコマンドを登録
  for (const command of editorCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`inlineMark.${command}`, () => {
        if (!providerInstance) {
          return;
        }
        try {
          providerInstance.sendEditorCommand(command);
        } catch (error) {
          logger.error('Failed to send editor command', {
            errorCode: 'SEND_EDITOR_COMMAND_FAILED',
            errorStack: String(error),
            details: { command },
          });
        }
      })
    );
  }

  logger.info('Extension activated');
}

export function deactivate(): void {
  logger.info('Extension deactivating');
  logger.dispose();
}
