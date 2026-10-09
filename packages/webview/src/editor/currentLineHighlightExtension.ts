/**
 * Current line highlight extension
 * - Adds a decoration to the current textblock (cursor line)
 * - Matches VS Code line highlight color as closely as possible
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { logObservabilityEvent } from '../observability.js';

const resolveHighlightTarget = (
  state: EditorState
): { pos: number; size: number; reason: 'textblock' | 'block' } | null => {
  const selection = state.selection;
  if (!selection.empty) {
    return null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isTextblock) {
      return { pos: $from.before(depth), size: node.nodeSize, reason: 'textblock' };
    }
  }
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isBlock) {
      return { pos: $from.before(depth), size: node.nodeSize, reason: 'block' };
    }
  }
  return null;
};

interface HighlightDecorationResult {
  deco: DecorationSet;
  pos: number | null;
  from: number | null;
  to: number | null;
  applied: boolean;
  reason: string;
}

const buildDecorations = (state: EditorState): HighlightDecorationResult => {
  const target = resolveHighlightTarget(state);
  if (!target) {
    return {
      deco: DecorationSet.empty,
      pos: null,
      from: null,
      to: null,
      applied: false,
      reason: state.selection.empty ? 'no-block-target' : 'selection-not-empty',
    };
  }
  const decoration = Decoration.node(target.pos, target.pos + target.size, { class: 'is-current-line' });
  return {
    deco: DecorationSet.create(state.doc, [decoration]),
    pos: target.pos,
    from: target.pos,
    to: target.pos + target.size,
    applied: true,
    reason: target.reason,
  };
};

export const CurrentLineHighlight = Extension.create({
  name: 'currentLineHighlight',

  addProseMirrorPlugins() {
    let lastPos: number | null = null;
    let lastApplied = false;
    let lastReason = 'uninitialized';
    return [
      new Plugin({
        key: new PluginKey('currentLineHighlight'),
        state: {
          init(_config, state) {
            const result = buildDecorations(state);
            lastPos = result.pos;
            lastApplied = result.applied;
            lastReason = result.reason;
            logObservabilityEvent('INFO', 'inlineEditor.decoration.currentLine', {
              phase: 'init',
              applied: result.applied,
              decorationClass: 'is-current-line',
              from: result.from,
              to: result.to,
              pos: result.pos,
              reason: result.reason,
              selectionFrom: state.selection.from,
              selectionTo: state.selection.to,
              selectionEmpty: state.selection.empty,
            });
            return result;
          },
          apply(tr, prev: HighlightDecorationResult, _oldState, newState) {
            if (!tr.selectionSet && !tr.docChanged) {
              return prev;
            }
            const next = buildDecorations(newState);
            if (
              next.pos !== lastPos ||
              next.applied !== lastApplied ||
              next.reason !== lastReason
            ) {
              logObservabilityEvent('DEBUG', 'inlineEditor.decoration.currentLine', {
                phase: 'apply',
                applied: next.applied,
                decorationClass: 'is-current-line',
                from: next.from,
                to: next.to,
                previousPos: lastPos,
                nextPos: next.pos,
                previousApplied: lastApplied,
                reason: next.reason,
                previousReason: lastReason,
                docChanged: tr.docChanged,
                selectionSet: tr.selectionSet,
                selectionFrom: newState.selection.from,
                selectionTo: newState.selection.to,
                selectionEmpty: newState.selection.empty,
              });
              lastPos = next.pos;
              lastApplied = next.applied;
              lastReason = next.reason;
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            const pluginState = this.getState(state) as { deco: DecorationSet } | undefined;
            return pluginState?.deco ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
