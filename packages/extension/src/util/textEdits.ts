/**
 * 役割: オフセットベースと VS Code Range ベースの編集変換ユーティリティ
 * 責務: Replace[] を WorkspaceEdit に変換、編集の正規化、オフセット/Range 変換
 * 不変条件: 編集は重複せず昇順であること
 * 
 * 設計書参照: 10.1 (Replace 型), 12.2 (ChangeGuard)
 * 
 * Replace 型 (設計書 10.1):
 * - start: 変更開始オフセット (0-indexed)
 * - end: 変更終了オフセット (exclusive)
 * - text: 挿入するテキスト
 * 
 * 変換例:
 * Replace: { start: 10, end: 15, text: "hello" }
 * → VS Code Range: Range(Position(0, 10), Position(0, 15))
 * → TextEdit: new TextEdit(range, "hello")
 * 
 * ChangeGuard (設計書 12.2):
 * - 大規模変更を検出して警告を表示
 * - maxChangedRatio: 変更率の閾値 (default: 0.5)
 * - maxChangedChars: 変更文字数の閾値 (default: 50000)
 * - maxHunks: 変更箇所数の閾値 (default: 200)
 * 
 * ChangeMetrics の例:
 * {
 *   changedChars: 1500,
 *   changedRatio: 0.15,
 *   hunkCount: 3,
 *   startOffset: 100,
 *   endOffset: 2000
 * }
 */

import * as vscode from 'vscode';
import type { Replace } from '../protocol/messages.js';

export function offsetToPosition(document: vscode.TextDocument, offset: number): vscode.Position {
  return document.positionAt(offset);
}

export function positionToOffset(document: vscode.TextDocument, position: vscode.Position): number {
  return document.offsetAt(position);
}

export function replaceToTextEdit(
  document: vscode.TextDocument,
  replace: Replace
): vscode.TextEdit {
  const startPos = offsetToPosition(document, replace.start);
  const endPos = offsetToPosition(document, replace.end);
  const range = new vscode.Range(startPos, endPos);
  return new vscode.TextEdit(range, replace.text);
}

export function replacesToWorkspaceEdit(
  document: vscode.TextDocument,
  replaces: Replace[]
): vscode.WorkspaceEdit {
  const workspaceEdit = new vscode.WorkspaceEdit();
  const textEdits = replaces.map((r) => replaceToTextEdit(document, r));
  workspaceEdit.set(document.uri, textEdits);
  return workspaceEdit;
}

export function normalizeReplaces(replaces: Replace[]): Replace[] {
  if (replaces.length === 0) {return [];}

  const sorted = [...replaces].sort((a, b) => a.start - b.start);

  const normalized: Replace[] = [];
  for (const replace of sorted) {
    const last = normalized[normalized.length - 1];
    if (last && last.end >= replace.start) {
      continue;
    }
    normalized.push(replace);
  }

  return normalized;
}

export function contentChangeEventToReplace(
  _document: vscode.TextDocument,
  change: vscode.TextDocumentContentChangeEvent
): Replace {
  // IMPORTANT:
  // `rangeOffset` / `rangeLength` are offsets in the document *before* the change is applied.
  // This matches our protocol contract where Replace offsets are based on the "previous text"
  // (i.e. the receiver's current shadowText) to avoid off-by-one/misaligned patches.
  // See: 詳細設計.md 9.3 / 10.3
  const start = change.rangeOffset;
  const end = change.rangeOffset + change.rangeLength;
  return {
    start,
    end,
    text: change.text,
  };
}

export function contentChangeEventsToReplaces(
  document: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): Replace[] {
  return changes.map((change) => contentChangeEventToReplace(document, change));
}

export function calculateChangedChars(replaces: Replace[]): number {
  let total = 0;
  for (const replace of replaces) {
    const deleted = replace.end - replace.start;
    const inserted = replace.text.length;
    total += Math.max(deleted, inserted);
  }
  return total;
}

export function calculateChangedRatio(replaces: Replace[], documentLength: number): number {
  if (documentLength === 0) {return replaces.length > 0 ? 1 : 0;}
  const changedChars = calculateChangedChars(replaces);
  return changedChars / documentLength;
}

export interface ChangeMetrics {
  changedChars: number;
  changedRatio: number;
  hunkCount: number;
  startOffset: number;
  endOffset: number;
}

export function calculateChangeMetrics(
  replaces: Replace[],
  documentLength: number
): ChangeMetrics {
  if (replaces.length === 0) {
    return {
      changedChars: 0,
      changedRatio: 0,
      hunkCount: 0,
      startOffset: 0,
      endOffset: 0,
    };
  }

  const changedChars = calculateChangedChars(replaces);
  const changedRatio = calculateChangedRatio(replaces, documentLength);
  const startOffset = Math.min(...replaces.map((r) => r.start));
  const endOffset = Math.max(...replaces.map((r) => r.end));

  return {
    changedChars,
    changedRatio,
    hunkCount: replaces.length,
    startOffset,
    endOffset,
  };
}

export function isChangeGuardExceeded(
  metrics: ChangeMetrics,
  config: {
    maxChangedRatio: number;
    maxChangedChars: number;
    maxHunks: number;
  }
): boolean {
  return (
    metrics.changedRatio > config.maxChangedRatio ||
    metrics.changedChars > config.maxChangedChars ||
    metrics.hunkCount > config.maxHunks
  );
}
