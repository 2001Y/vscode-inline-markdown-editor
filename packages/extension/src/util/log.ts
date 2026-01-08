/**
 * 役割: 拡張機能のロギングユーティリティ
 * 責務: OutputChannel ロギングとオプションの JSONL ファイルロギングを提供
 * 不変条件: ログ出力は設定で制御可能であること
 *
 * 設計書参照: 15 (ログ/診断)
 *
 * 出力先 (設計書 15.1):
 * - OutputChannel: すぐ見たいログ（エラー/重要イベント）
 * - JSONL: 処理中ファイルと同階層の `_log_inlineMark/` フォルダに出力
 *   - 例: /path/to/doc.md → /path/to/_log_inlineMark/doc-{timestamp}.jsonl
 *
 * デバッグオプション (設計書 23.4):
 * - `inlineMarkdownEditor.debug.enabled` を唯一の master switch として扱う
 * - enabled=true: DEBUG/TRACE ログ、JSONL 出力、内容ログがすべて有効
 * - enabled=false: WARN/ERROR のみ OutputChannel に出力
 *
 * ログレベル (設計書 15.2):
 * INFO / DEBUG / TRACE / WARN / ERROR
 *
 * 記録項目 (設計書 15.3):
 * - ts (ISO8601), level, event
 * - sessionId, clientId, docUri
 * - docVersion (current/base/applied), txId
 * - changes (件数、総文字数、範囲サマリ)
 * - durationMs
 * - errorCode, errorStack (ERROR の場合)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'INFO' | 'DEBUG' | 'TRACE' | 'WARN' | 'ERROR';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  sessionId?: string;
  clientId?: string;
  docUri?: string;
  docVersion?: number;
  baseVersion?: number;
  appliedVersion?: number;
  txId?: number;
  changesCount?: number;
  totalChars?: number;
  changeRange?: { start: number; end: number };
  durationMs?: number;
  errorCode?: string;
  errorStack?: string;
  details?: Record<string, unknown>;
}

/** ドキュメントごとの JSONL ログファイル情報 */
interface DocLogInfo {
  jsonlPath: string;
  docBaseName: string;
}

export class Logger {
  private outputChannel: vscode.OutputChannel;
  private debugEnabled = false;
  /** ドキュメント URI → JSONL ファイルパスのマップ */
  private docLogMap = new Map<string, DocLogInfo>();

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  initialize(context: vscode.ExtensionContext): void {
    this.updateConfig();

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('inlineMarkdownEditor.debug')) {
          this.updateConfig();
        }
      })
    );
  }

  private updateConfig(): void {
    const config = vscode.workspace.getConfiguration('inlineMarkdownEditor.debug');
    this.debugEnabled = config.get<boolean>('enabled', false);
  }

  /**
   * ドキュメント用の JSONL ログパスを設定
   * 出力先: ドキュメントと同階層の `_log_inlineMark/` フォルダ
   */
  setupDocumentLog(docUri: vscode.Uri): void {
    if (!this.debugEnabled) { return; }
    if (this.docLogMap.has(docUri.toString())) { return; }

    try {
      const docDir = path.dirname(docUri.fsPath);
      const docBaseName = path.basename(docUri.fsPath, path.extname(docUri.fsPath));
      const logsDir = path.join(docDir, '_log_inlineMark');

      // ログディレクトリを作成
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonlPath = path.join(logsDir, `${docBaseName}-${timestamp}.jsonl`);

      this.docLogMap.set(docUri.toString(), { jsonlPath, docBaseName });
      this.info('JSONL logging started', { docUri: docUri.toString(), details: { jsonlPath } });
    } catch (error) {
      this.error('Failed to setup JSONL logging', { details: { error: String(error) } });
    }
  }

  /**
   * ドキュメントのログを終了
   */
  cleanupDocumentLog(docUri: vscode.Uri): void {
    this.docLogMap.delete(docUri.toString());
  }

  private shouldLog(level: LogLevel): boolean {
    // WARN/ERROR は常に出力
    if (level === 'WARN' || level === 'ERROR') {
      return true;
    }
    // debug.enabled=false の場合は DEBUG/TRACE/INFO を出さない
    if (!this.debugEnabled) {
      return false;
    }
    // debug.enabled=true の場合は全レベル出力
    return true;
  }

  private formatMessage(level: LogLevel, event: string, details?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    let message = `[${timestamp}] [${level}] ${event}`;
    if (details && Object.keys(details).length > 0) {
      message += ` ${JSON.stringify(details)}`;
    }
    return message;
  }

  private writeToChannel(level: LogLevel, event: string, details?: Record<string, unknown>): void {
    const message = this.formatMessage(level, event, details);
    this.outputChannel.appendLine(message);
  }

  private writeToJsonl(entry: LogEntry): void {
    if (!this.debugEnabled) { return; }

    // docUri が指定されている場合、そのドキュメントのログファイルに書き込む
    const docUri = entry.docUri;
    if (!docUri) { return; }

    const docLog = this.docLogMap.get(docUri);
    if (!docLog) { return; }

    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(docLog.jsonlPath, line);
    } catch (_error) {
      // Ignore JSONL write errors
    }
  }

  log(level: LogLevel, event: string, entry?: Partial<LogEntry>): void {
    if (!this.shouldLog(level)) { return; }

    this.writeToChannel(level, event, entry as Record<string, unknown>);

    if (this.debugEnabled && entry?.docUri) {
      const fullEntry: LogEntry = {
        ts: new Date().toISOString(),
        level,
        event,
        ...entry,
      };
      this.writeToJsonl(fullEntry);
    }
  }

  info(event: string, entry?: Partial<LogEntry>): void {
    this.log('INFO', event, entry);
  }

  debug(event: string, entry?: Partial<LogEntry>): void {
    this.log('DEBUG', event, entry);
  }

  trace(event: string, entry?: Partial<LogEntry>): void {
    this.log('TRACE', event, entry);
  }

  warn(event: string, entry?: Partial<LogEntry>): void {
    this.log('WARN', event, entry);
  }

  error(event: string, entry?: Partial<LogEntry>): void {
    this.log('ERROR', event, entry);
  }

  show(): void {
    this.outputChannel.show();
  }

  /**
   * デバッグモードが有効かどうか
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * 指定ドキュメントの JSONL ログパスを取得
   */
  getJsonlPath(docUri?: vscode.Uri): string | undefined {
    if (!docUri) { return undefined; }
    return this.docLogMap.get(docUri.toString())?.jsonlPath;
  }

  /**
   * Export Logs: ワークスペース内の全 _log_inlineMark フォルダからログを収集
   */
  async exportLogs(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('No workspace folder open');
      return undefined;
    }

    try {
      // ワークスペース内の _log_inlineMark フォルダを検索
      const logFiles: string[] = [];
      for (const folder of workspaceFolders) {
        const pattern = new vscode.RelativePattern(folder, '**/_log_inlineMark/*.jsonl');
        const files = await vscode.workspace.findFiles(pattern);
        logFiles.push(...files.map(f => f.fsPath));
      }

      if (logFiles.length === 0) {
        vscode.window.showInformationMessage('No log files found in _log_inlineMark folders');
        return undefined;
      }

      const exportPath = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`inline-markdown-logs-${Date.now()}.jsonl`),
        filters: { 'JSONL': ['jsonl'] },
      });

      if (!exportPath) { return undefined; }

      let combinedContent = '';
      for (const file of logFiles) {
        const content = await fs.promises.readFile(file, 'utf-8');
        const maskedContent = this.maskExportContent(content, workspaceFolders);
        combinedContent += maskedContent;
      }

      await fs.promises.writeFile(exportPath.fsPath, combinedContent);
      return exportPath.fsPath;
    } catch (error) {
      this.error('Failed to export logs', { details: { error: String(error) } });
      return undefined;
    }
  }

  /**
   * Export 用のマスキング処理 (設計書 15.8)
   */
  private maskExportContent(
    content: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): string {
    const lines = content.split('\n');
    const maskedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        maskedLines.push(line);
        continue;
      }

      try {
        const entry = JSON.parse(line) as LogEntry;

        // docUri をワークスペース相対パスに変換
        if (entry.docUri) {
          entry.docUri = this.maskPath(entry.docUri, workspaceFolders);
        }

        // errorStack 内のパスをマスキング
        if (entry.errorStack) {
          entry.errorStack = this.maskPathsInString(entry.errorStack, workspaceFolders);
        }

        // details 内の url や path をマスキング
        if (entry.details) {
          entry.details = this.maskDetailsForExport(entry.details, workspaceFolders);
        }

        maskedLines.push(JSON.stringify(entry));
      } catch {
        maskedLines.push(this.maskPathsInString(line, workspaceFolders));
      }
    }

    return maskedLines.join('\n');
  }

  /**
   * パスをワークスペース相対パスに変換
   */
  private maskPath(
    uriString: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): string {
    for (const folder of workspaceFolders) {
      const folderUri = folder.uri.toString();
      if (uriString.startsWith(folderUri)) {
        const relativePath = uriString.slice(folderUri.length);
        return `workspace://${folder.name}${relativePath}`;
      }
    }

    const match = uriString.match(/[/\\]([^/\\]+)$/);
    return match ? `[external]/${match[1]}` : '[masked-path]';
  }

  /**
   * 文字列内のパスをマスキング（errorStack 等用）
   */
  private maskPathsInString(
    str: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): string {
    let result = str.replace(/file:\/\/\/[^\s"']+/g, (match) => {
      return this.maskPath(match, workspaceFolders);
    });

    result = result.replace(/(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z]+/g, (match) => {
      const fileName = match.split('/').pop() || '[file]';
      return `[path]/${fileName}`;
    });

    return result;
  }

  /**
   * details オブジェクト内のパスをマスキング
   */
  private maskDetailsForExport(
    details: Record<string, unknown>,
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): Record<string, unknown> {
    const masked = { ...details };

    if (typeof masked.url === 'string' && masked.url.startsWith('file://')) {
      masked.url = this.maskPath(masked.url, workspaceFolders);
    }

    if (typeof masked.path === 'string') {
      masked.path = this.maskPath(masked.path, workspaceFolders);
    }

    return masked;
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export const logger = new Logger('Inline Markdown Editor');
