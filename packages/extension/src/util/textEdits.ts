/**
 * Role: Text edit utilities for converting between offset-based and VS Code Range-based edits
 * Responsibility: Convert Replace[] to WorkspaceEdit, normalize edits, handle offset/Range conversion
 * Invariant: Edits must be non-overlapping and in ascending order
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
  document: vscode.TextDocument,
  change: vscode.TextDocumentContentChangeEvent
): Replace {
  const start = positionToOffset(document, change.range.start);
  const end = positionToOffset(document, change.range.end);
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
