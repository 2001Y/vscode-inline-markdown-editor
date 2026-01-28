/**
 * 役割: Enter 入力後に選択が停滞するケースを検知して補正
 * 責務: insertParagraph/insertLineBreak 後に Selection が動いていない場合のみ前方へ移動
 * 不変条件: 余計なフォールバックは行わず、必要時のみ補正する
 */

import { Extension } from '@tiptap/core';
import { Plugin, Selection } from '@tiptap/pm/state';

const MODULE = 'EnterSelectionFix';

const logInfo = (msg: string, data?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[INFO][${MODULE}] ${timestamp} ${msg}`, data);
  } else {
    console.log(`[INFO][${MODULE}] ${timestamp} ${msg}`);
  }
};

const logWarning = (msg: string, data?: Record<string, unknown>): void => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.warn(`[WARNING][${MODULE}] ${timestamp} ${msg}`, data);
  } else {
    console.warn(`[WARNING][${MODULE}] ${timestamp} ${msg}`);
  }
};

export const EnterSelectionFix = Extension.create({
  name: 'enterSelectionFix',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (transactions.some((tr) => tr.getMeta('enterSelectionFix'))) {
            return;
          }

          const hasEnterInput = transactions.some((tr) => {
            if (!tr.docChanged) {
              return false;
            }
            const inputType = tr.getMeta('inputType');
            return inputType === 'insertParagraph' || inputType === 'insertLineBreak';
          });

          if (!hasEnterInput) {
            return;
          }

          let mappedOldSelection = oldState.selection;
          for (const tr of transactions) {
            mappedOldSelection = mappedOldSelection.map(tr.doc, tr.mapping);
          }

          if (!mappedOldSelection.empty || !newState.selection.empty) {
            return;
          }

          if (newState.selection.from !== mappedOldSelection.from) {
            return;
          }

          const next = Selection.findFrom(newState.selection.$from, 1, true);

          if (!next || next.from === newState.selection.from) {
            logWarning('Selection fix skipped: next selection not found', {
              from: newState.selection.from,
            });
            return;
          }

          logInfo('Selection advanced after Enter', {
            from: newState.selection.from,
            to: next.from,
            fromParent: newState.selection.$from.parent.type.name,
            toParent: next.$from.parent.type.name,
          });

          const tr = newState.tr.setSelection(next);
          tr.setMeta('enterSelectionFix', true);
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});

export default EnterSelectionFix;
