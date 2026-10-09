import * as vscode from 'vscode';
import type {
  ActiveTextEditorSnapshot,
  InlineEditorOpenTrace,
  PositionSnapshot,
  RangeSnapshot,
  SelectionSnapshot,
  TabInputSnapshot,
} from '../protocol/messages.js';

let openTraceSeq = 0;

const nextOpenTraceSeq = (): number => {
  openTraceSeq += 1;
  return openTraceSeq;
};

const toPositionSnapshot = (position: vscode.Position): PositionSnapshot => {
  return {
    line: position.line,
    character: position.character,
  };
};

const toRangeSnapshot = (range: vscode.Range): RangeSnapshot => {
  return {
    start: toPositionSnapshot(range.start),
    end: toPositionSnapshot(range.end),
  };
};

const toSelectionSnapshot = (selection: vscode.Selection): SelectionSnapshot => {
  return {
    ...toRangeSnapshot(selection),
    anchor: toPositionSnapshot(selection.anchor),
    active: toPositionSnapshot(selection.active),
    isEmpty: selection.isEmpty,
    isReversed: selection.isReversed,
  };
};

export const captureTabInputSnapshot = (input: unknown): TabInputSnapshot | null => {
  if (!input) {
    return null;
  }
  if (input instanceof vscode.TabInputText) {
    return {
      kind: 'text',
      uri: input.uri.toString(),
    };
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return {
      kind: 'textDiff',
      originalUri: input.original.toString(),
      modifiedUri: input.modified.toString(),
    };
  }
  if (input instanceof vscode.TabInputCustom) {
    return {
      kind: 'custom',
      uri: input.uri.toString(),
      viewType: input.viewType,
    };
  }
  return {
    kind: 'unknown',
  };
};

export const captureActiveTextEditorSnapshot = (
  editor: vscode.TextEditor | undefined
): ActiveTextEditorSnapshot | null => {
  if (!editor) {
    return null;
  }
  return {
    docUri: editor.document.uri.toString(),
    viewColumn: editor.viewColumn ?? null,
    selection: toSelectionSnapshot(editor.selection),
    visibleRanges: editor.visibleRanges.map(toRangeSnapshot),
  };
};

export const resolveReopenTargetUri = (
  input: unknown,
  activeTextEditor: vscode.TextEditor | undefined,
  customViewType?: string
): vscode.Uri | null => {
  if (
    customViewType &&
    input instanceof vscode.TabInputCustom &&
    input.viewType === customViewType
  ) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  if (activeTextEditor) {
    return activeTextEditor.document.uri;
  }
  return null;
};

interface CaptureInlineEditorOpenTraceOptions {
  targetUri: vscode.Uri;
  reason: string;
  sourceCommand: string | null;
  requestedViewType: string;
  viewColumn: vscode.ViewColumn | undefined;
  activeTab: vscode.Tab | undefined;
  activeTextEditor: vscode.TextEditor | undefined;
}

export const captureInlineEditorOpenTrace = (
  options: CaptureInlineEditorOpenTraceOptions
): InlineEditorOpenTrace => {
  const activeTextEditorSnapshot = captureActiveTextEditorSnapshot(options.activeTextEditor);
  const targetUriString = options.targetUri.toString();
  const targetSelection =
    options.activeTextEditor?.document.uri.toString() === targetUriString
      ? toSelectionSnapshot(options.activeTextEditor.selection)
      : null;

  return {
    seq: nextOpenTraceSeq(),
    reason: options.reason,
    sourceCommand: options.sourceCommand,
    requestedViewType: options.requestedViewType,
    targetUri: targetUriString,
    targetRange: targetSelection
      ? {
          start: targetSelection.start,
          end: targetSelection.end,
        }
      : null,
    targetSelection,
    targetVisibleRanges:
      options.activeTextEditor?.document.uri.toString() === targetUriString
        ? options.activeTextEditor.visibleRanges.map(toRangeSnapshot)
        : [],
    activeTextEditor: activeTextEditorSnapshot,
    activeTab: captureTabInputSnapshot(options.activeTab?.input),
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now(),
    viewColumn: options.viewColumn ?? options.activeTextEditor?.viewColumn ?? null,
  };
};
