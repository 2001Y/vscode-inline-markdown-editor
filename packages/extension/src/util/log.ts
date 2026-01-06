/**
 * Role: Logging utility for the extension
 * Responsibility: Provide OutputChannel logging and optional JSONL file logging
 * Invariant: Log output should be configurable via settings
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
    if (!this.globalStorageUri) return;

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
    } catch (error) {
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
    if (!this.jsonlEnabled || !this.jsonlPath) return;

    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.jsonlPath, line);

      const stats = fs.statSync(this.jsonlPath);
      if (stats.size > this.jsonlMaxBytes) {
        this.rotateJsonl();
      }
    } catch (error) {
      // Ignore JSONL write errors
    }
  }

  private rotateJsonl(): void {
    if (!this.jsonlPath || !this.globalStorageUri) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = vscode.Uri.joinPath(this.globalStorageUri, 'logs').fsPath;
    this.jsonlPath = path.join(logsDir, `session-${timestamp}.jsonl`);
  }

  log(level: LogLevel, event: string, entry?: Partial<LogEntry>): void {
    if (!this.shouldLog(level)) return;

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

  async exportLogs(): Promise<string | undefined> {
    if (!this.globalStorageUri) return undefined;

    const logsDir = vscode.Uri.joinPath(this.globalStorageUri, 'logs');
    try {
      const files = await fs.promises.readdir(logsDir.fsPath);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) return undefined;

      const exportPath = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`inline-markdown-logs-${Date.now()}.jsonl`),
        filters: { 'JSONL': ['jsonl'] },
      });

      if (!exportPath) return undefined;

      let combinedContent = '';
      for (const file of jsonlFiles) {
        const content = await fs.promises.readFile(path.join(logsDir.fsPath, file), 'utf-8');
        combinedContent += content;
      }

      await fs.promises.writeFile(exportPath.fsPath, combinedContent);
      return exportPath.fsPath;
    } catch (error) {
      this.error('Failed to export logs', { details: { error: String(error) } });
      return undefined;
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

export const logger = new Logger('Inline Markdown Editor');
