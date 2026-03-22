/**
 * Search highlight extension
 * - Wraps prosemirror-search plugin for find/replace highlighting.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { search } from 'prosemirror-search';

export type ActiveSearchMatch = { from: number; to: number } | null;
export const activeSearchMatchKey = new PluginKey<ActiveSearchMatch>('activeSearchMatch');

export const setActiveSearchMatch = (tr: Transaction, match: ActiveSearchMatch): Transaction => {
  tr.setMeta(activeSearchMatchKey, match);
  return tr;
};

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    const activeMatchPlugin = new Plugin<ActiveSearchMatch>({
      key: activeSearchMatchKey,
      state: {
        init: () => null,
        apply: (tr, prev) => {
          const meta = tr.getMeta(activeSearchMatchKey) as ActiveSearchMatch | undefined;
          let next = meta !== undefined ? meta : prev;
          if (next && tr.docChanged && meta === undefined) {
            const mappedFrom = tr.mapping.map(next.from, 1);
            const mappedTo = tr.mapping.map(next.to, -1);
            if (mappedFrom >= mappedTo) {
              next = null;
            } else {
              next = { from: mappedFrom, to: mappedTo };
            }
          }
          return next;
        },
      },
      props: {
        decorations: (state) => {
          const match = activeSearchMatchKey.getState(state);
          if (!match) {
            return null;
          }
          return DecorationSet.create(state.doc, [
            Decoration.inline(match.from, match.to, { class: 'ProseMirror-active-search-match' }),
          ]);
        },
      },
    });

    return [search(), activeMatchPlugin];
  },
});
