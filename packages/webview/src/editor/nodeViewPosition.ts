import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Detached NodeViews may return undefined or throw from getPos. */
export const resolveNodeViewPosition = (
  getPos: (() => number | undefined) | false | undefined,
  doc: ProseMirrorNode,
  expectedType: string
): number | null => {
  if (!getPos) {return null;}
  try {
    const pos = getPos();
    if (typeof pos !== 'number' || !Number.isSafeInteger(pos) || pos < 0 || pos > doc.content.size) {return null;}
    return doc.nodeAt(pos)?.type.name === expectedType ? pos : null;
  } catch {
    return null;
  }
};
