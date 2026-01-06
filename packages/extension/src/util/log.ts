/**
 * 役割: 拡張機能のロギングユーティリティ
 * 責務: OutputChannel ロギングとオプションの JSONL ファイルロギングを提供
 * 不変条件: ログ出力は設定で制御可能であること
 * 
 * 設計書参照: 15 (ログ/診断)
 * 
 * 出力先 (設計書 15.1):
 * - OutputChannel: すぐ見たいログ（エラー/重要イベント）
 * - JSONL: 再現性・共有性のための構造化ログ（デフォルト無効）
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
 * 
 * 内容ログの方針 (設計書 15.4):
 * - デフォルトは全文 Markdown をログに残さない
 * - debug.logContent=true の場合のみ内容を記録
 * 
 * JSONL ローテーション (設計書 15.7):
 * - 最大ファイルサイズ: jsonlMaxBytes (default: 5MB)
 * - 最大ファイル数: jsonlMaxFiles (default: 20)
 * - 保持期間: jsonlRetentionDays (default: 7日)
 * 
 * Export Logs のマスキング (設計書 15.8):
 * - パスは workspace 相対またはハッシュ化
 * - 内容は原則含めない（debug.logContent の許可が必要）
 * 
 * LogEntry の例:
 * {
 *   "ts": "2026-01-06T12:00:00.000Z",
 *   "level": "INFO",
 *   "event": "Edit applied",
 *   "sessionId": "uuid",
 *   "clientId": "client-1",
 *   "docUri": "file:///path/to/doc.md",
 *   "docVersion": 13,
 *   "txId": 101,
 *   "changesCount": 2,
 *   "durationMs": 15
 * }
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'INFO' | 'DEBUG' | 'TRACE' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

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

export class Logger {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = 'INFO';
  private loggingEnabled = false;
  private jsonlEnabled = false;
  private jsonlPath: string | undefined;
  private jsonlMaxBytes = 5000000;
  private jsonlMaxFiles = 20;
  private jsonlRetentionDays = 7;
  private logContent = false;
  private globalStorageUri: vscode.Uri | undefined;

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  initialize(context: vscode.ExtensionContext): void {
    this.globalStorageUri = context.globalStorageUri;
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
    this.loggingEnabled = config.get<boolean>('logging', false);
    this.logLevel = config.get<LogLevel>('logLevel', 'INFO');
    this.jsonlEnabled = config.get<boolean>('logToJsonl', false);
    this.jsonlMaxBytes = config.get<number>('jsonlMaxBytes', 5000000);
    this.jsonlMaxFiles = config.get<number>('jsonlMaxFiles', 20);
    this.jsonlRetentionDays = config.get<number>('jsonlRetentionDays', 7);
    this.logContent = config.get<boolean>('logContent', false);

    if (this.jsonlEnabled && this.globalStorageUri) {
      this.setupJsonlPath();
    }
  }

  private async setupJsonlPath(): Promise<void> {
    if (!this.globalStorageUri) {return;}

    const logsDir = vscode.Uri.joinPath(this.globalStorageUri, 'logs');
    try {
      await vscode.workspace.fs.createDirectory(logsDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.jsonlPath = path.join(logsDir.fsPath, `session-${timestamp}.jsonl`);
      await this.cleanupOldLogs(logsDir.fsPath);
    } catch (error) {
      this.error('Failed to setup JSONL logging', { details: { error: String(error) } });
    }
  }

  private async cleanupOldLogs(logsDir: string): Promise<void> {
    try {
      const files = await fs.promises.readdir(logsDir);
      const jsonlFiles = files
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => ({
          name: f,
          path: path.join(logsDir, f),
          stat: fs.statSync(path.join(logsDir, f)),
        }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

      const cutoffDate = Date.now() - this.jsonlRetentionDays * 24 * 60 * 60 * 1000;

      for (let i = 0; i < jsonlFiles.length; i++) {
        const file = jsonlFiles[i];
        if (i >= this.jsonlMaxFiles || file.stat.mtimeMs < cutoffDate) {
          await fs.promises.unlink(file.path);
        }
      }
    } catch (_error) {
      // Ignore cleanup errors
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.loggingEnabled && level !== 'ERROR' && level !== 'WARN') {
      return false;
    }
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.logLevel];
  }

  private formatMessage(level: LogLevel, event: string, details?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    let message = `[${timestamp}] [${level}] ${event}`;
    if (details && Object.keys(details).length > 0) {
      const safeDetails = this.logContent ? details : this.maskContent(details);
      message += ` ${JSON.stringify(safeDetails)}`;
    }
    return message;
  }

  private maskContent(details: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...details };
    if ('content' in masked && typeof masked.content === 'string') {
      masked.content = `[${(masked.content as string).length} chars]`;
    }
    if ('fullContent' in masked && typeof masked.fullContent === 'string') {
      masked.fullContent = `[${(masked.fullContent as string).length} chars]`;
    }
    return masked;
  }

  private writeToChannel(level: LogLevel, event: string, details?: Record<string, unknown>): void {
    const message = this.formatMessage(level, event, details);
    this.outputChannel.appendLine(message);
  }

  private writeToJsonl(entry: LogEntry): void {
    if (!this.jsonlEnabled || !this.jsonlPath) {return;}

    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.jsonlPath, line);

      const stats = fs.statSync(this.jsonlPath);
      if (stats.size > this.jsonlMaxBytes) {
        this.rotateJsonl();
      }
    } catch (_error) {
      // Ignore JSONL write errors
    }
  }

  private rotateJsonl(): void {
    if (!this.jsonlPath || !this.globalStorageUri) {return;}

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = vscode.Uri.joinPath(this.globalStorageUri, 'logs').fsPath;
    this.jsonlPath = path.join(logsDir, `session-${timestamp}.jsonl`);
  }

  log(level: LogLevel, event: string, entry?: Partial<LogEntry>): void {
    if (!this.shouldLog(level)) {return;}

    this.writeToChannel(level, event, entry as Record<string, unknown>);

    if (this.jsonlEnabled) {
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

  getJsonlPath(): string | undefined {
    return this.jsonlPath;
  }

  /**
   * Export Logs のマスキング (設計書 15.8):
   * - パスは workspace 相対またはハッシュ化
   * - 内容は原則含めない（debug.logContent の許可が必要）
   * - docUri は file:///... を含むため、ワークスペース相対パスに変換
   */
  async exportLogs(): Promise<string | undefined> {
    if (!this.globalStorageUri) {return undefined;}

    const logsDir = vscode.Uri.joinPath(this.globalStorageUri, 'logs');
    try {
      const files = await fs.promises.readdir(logsDir.fsPath);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) {return undefined;}

      const exportPath = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`inline-markdown-logs-${Date.now()}.jsonl`),
        filters: { 'JSONL': ['jsonl'] },
      });

      if (!exportPath) {return undefined;}

      let combinedContent = '';
      for (const file of jsonlFiles) {
        const content = await fs.promises.readFile(path.join(logsDir.fsPath, file), 'utf-8');
        // 設計書 15.8: Export 時にパスをマスキング
        const maskedContent = this.maskExportContent(content);
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
   * - docUri を workspace 相対パスに変換
   * - errorStack 内のパスもマスキング
   * - details 内の content/fullContent は既にマスキング済み
   */
  private maskExportContent(content: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
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
        // JSON パースに失敗した行はそのまま出力（ただしパスをマスキング）
        maskedLines.push(this.maskPathsInString(line, workspaceFolders));
      }
    }

    return maskedLines.join('\n');
  }

  /**
   * パスをワークスペース相対パスに変換
   * file:///path/to/workspace/file.md → workspace://file.md
   */
  private maskPath(
    uriString: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
  ): string {
    if (!workspaceFolders || workspaceFolders.length === 0) {
      // ワークスペースがない場合はファイル名のみを残す
      const match = uriString.match(/[/\\]([^/\\]+)$/);
      return match ? `[file]/${match[1]}` : '[masked-path]';
    }

    for (const folder of workspaceFolders) {
      const folderUri = folder.uri.toString();
      if (uriString.startsWith(folderUri)) {
        const relativePath = uriString.slice(folderUri.length);
        return `workspace://${folder.name}${relativePath}`;
      }
    }

    // ワークスペース外のパスはファイル名のみを残す
    const match = uriString.match(/[/\\]([^/\\]+)$/);
    return match ? `[external]/${match[1]}` : '[masked-path]';
  }

  /**
   * 文字列内のパスをマスキング（errorStack 等用）
   */
  private maskPathsInString(
    str: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
  ): string {
    // file:// URI をマスキング
    let result = str.replace(/file:\/\/\/[^\s"']+/g, (match) => {
      return this.maskPath(match, workspaceFolders);
    });

    // 絶対パス（Unix/Windows）をマスキング
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
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
  ): Record<string, unknown> {
    const masked = { ...details };

    // url フィールドのマスキング（file:// の場合のみ）
    if (typeof masked.url === 'string' && masked.url.startsWith('file://')) {
      masked.url = this.maskPath(masked.url, workspaceFolders);
    }

    // path フィールドのマスキング
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
