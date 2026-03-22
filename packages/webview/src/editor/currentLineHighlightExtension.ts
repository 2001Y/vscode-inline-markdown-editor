/**
 * Current line highlight extension
 * - Adds a decoration to the current textblock (cursor line)
 * - Matches VS Code line highlight color as closely as possible
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { createLogger } from '../logger.js';

const MODULE = 'CurrentLineHighlight';
const logger = createLogger(MODULE);

const log = (level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR', message: string, details?: Record<string, unknown>) => {
  switch (level) {
    case 'INFO':
      logger.info(message, details);
      return;
    case 'DEBUG':
      logger.debug(message, details);
      return;
    case 'WARNING':
      logger.warn(message, details);
      return;
    case 'ERROR':
      logger.error(message, details);
      return;
  }
};

const resolveHighlightTarget = (state: EditorState): { pos: number; size: number } | null => {
  const selection = state.selection;
  if (!selection.empty) {
    return null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isTextblock) {
      return { pos: $from.before(depth), size: node.nodeSize };
    }
  }
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isBlock) {
      return { pos: $from.before(depth), size: node.nodeSize };
    }
  }
  return null;
};

const buildDecorations = (state: EditorState): { deco: DecorationSet; pos: number | null } => {
  const target = resolveHighlightTarget(state);
  if (!target) {
    return { deco: DecorationSet.empty, pos: null };
  }
  const decoration = Decoration.node(target.pos, target.pos + target.size, { class: 'is-current-line' });
  return { deco: DecorationSet.create(state.doc, [decoration]), pos: target.pos };
};

export const CurrentLineHighlight = Extension.create({
  name: 'currentLineHighlight',

  addProseMirrorPlugins() {
    let lastPos: number | null = null;
    return [
      new Plugin({
        key: new PluginKey('currentLineHighlight'),
        state: {
          init(_config, state) {
            const result = buildDecorations(state);
            lastPos = result.pos;
            log('INFO', 'Current line highlight initialized', { pos: result.pos });
            return result;
          },
          apply(tr, prev: { deco: DecorationSet; pos: number | null }, _oldState, newState) {
            if (!tr.selectionSet && !tr.docChanged) {
              return prev;
            }
            const next = buildDecorations(newState);
            if (next.pos !== lastPos) {
              log('DEBUG', 'Current line highlight updated', { from: lastPos, to: next.pos });
              lastPos = next.pos;
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
