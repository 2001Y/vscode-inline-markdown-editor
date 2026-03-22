/**
 * 役割: Table ブロックを block-handle-container + block-content 構成で表示する
 * 責務: テーブル本体を block-content 内に包み、ハンドル用の余白を確保
 * 不変条件: Table の編集互換性を維持し、tbody を contentDOM として提供する
 */

import { Table } from '@tiptap/extension-table';
import { applyNodeViewHandleState, createNodeViewHandleContainer, resolveBlockHandleEligibility } from './blockHandlesExtension.js';

export const TableBlock = Table.extend({
  addNodeView() {
    return ({ getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'table-block';
      dom.setAttribute('data-type', 'table-block');
      const handleContainer = createNodeViewHandleContainer();
      dom.appendChild(handleContainer);

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      const table = document.createElement('table');
      table.className = 'table-block-table';
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      contentWrapper.appendChild(table);

      const syncHandleState = () => {
        const eligibility = resolveBlockHandleEligibility(editor.state, getPos, 'table');
        applyNodeViewHandleState(dom, handleContainer, eligibility, 'table');
      };

      syncHandleState();

      return {
        dom,
        contentDOM: tbody,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'table') {
            return false;
          }
          syncHandleState();
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return false;
        },
      };
    };
  },
});

export default TableBlock;
