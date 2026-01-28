/**
 * 役割: Table ブロックを block-handle-container + block-content 構成で表示する
 * 責務: テーブル本体を block-content 内に包み、ハンドル用の余白を確保
 * 不変条件: Table の編集互換性を維持し、tbody を contentDOM として提供する
 */

import { Table } from '@tiptap/extension-table';
import { createDragHandleElement, shouldRenderBlockHandle } from './blockHandlesExtension.js';

export const TableBlock = Table.extend({
  addNodeView() {
    return ({ getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'table-block';
      dom.setAttribute('data-type', 'table-block');

      let handle: HTMLElement | null = null;

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'block-content';
      dom.appendChild(contentWrapper);

      const table = document.createElement('table');
      table.className = 'table-block-table';
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      contentWrapper.appendChild(table);

      const resolvePos = () => {
        const pos = getPos();
        return typeof pos === 'number' ? pos : null;
      };

      const syncHandlePos = () => {
        if (!handle) {
          return;
        }
        const pos = resolvePos();
        if (pos !== null) {
          handle.dataset.blockPos = String(pos);
          handle.dataset.blockType = 'table';
        } else {
          delete handle.dataset.blockPos;
        }
      };

      const syncHandleState = () => {
        const shouldShowHandle = shouldRenderBlockHandle(editor.state, getPos, 'table');
        dom.classList.toggle('block-handle-host', shouldShowHandle);

        if (shouldShowHandle && !handle) {
          handle = createDragHandleElement();
          handle.setAttribute('contenteditable', 'false');
          const grip = handle.querySelector('.block-handle') as HTMLElement | null;
          if (grip) {
            grip.draggable = false;
            grip.setAttribute('draggable', 'false');
          }
          dom.insertBefore(handle, contentWrapper);
        } else if (!shouldShowHandle && handle) {
          handle.remove();
          handle = null;
        }
      };

      syncHandleState();
      syncHandlePos();

      return {
        dom,
        contentDOM: tbody,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'table') {
            return false;
          }
          syncHandleState();
          syncHandlePos();
          return true;
        },
        stopEvent: (event) => {
          if (!(event.target instanceof Element)) {
            return false;
          }
          return handle ? handle.contains(event.target) : false;
        },
      };
    };
  },
});

export default TableBlock;
