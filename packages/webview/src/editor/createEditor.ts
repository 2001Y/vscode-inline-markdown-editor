/**
 * Role: Tiptap editor instance creation and configuration
 * Responsibility: Create and configure Tiptap editor with extensions, handle user input
 * Invariant: Editor state changes trigger sync via SyncClient
 */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { RawBlock } from './rawBlockExtension.js';
import { createMarkdownCodec, type MarkdownCodec } from './markdownCodec.js';
import { computeDiff, isChangeGuardExceeded, type DiffResult } from './diffEngine.js';
import type { SyncClient } from '../protocol/client.js';
import type { Replace } from '../protocol/types.js';

export interface EditorInstance {
  editor: Editor;
  codec: MarkdownCodec;
  destroy: () => void;
  setContent: (markdown: string) => void;
  applyChanges: (changes: Replace[]) => void;
}

export interface CreateEditorOptions {
  container: HTMLElement;
  syncClient: SyncClient;
  onChangeGuardExceeded?: (metrics: DiffResult['metrics']) => void;
}

export function createEditor(options: CreateEditorOptions): EditorInstance {
  const { container, syncClient, onChangeGuardExceeded } = options;
  const codec = createMarkdownCodec();

  const editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      RawBlock,
    ],
    editorProps: {
      attributes: {
        class: 'inline-markdown-editor-content',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (syncClient.isApplyingRemote()) {
        return;
      }

      syncClient.scheduleEdit(() => {
        return computeChanges(updatedEditor, codec, syncClient, onChangeGuardExceeded);
      });
    },
  });

  function setContent(markdown: string): void {
    const doc = codec.parse(markdown);
    editor.commands.setContent(doc);
    syncClient.updateShadowText(markdown);
  }

  function applyChanges(changes: Replace[]): void {
    if (changes.length === 0) {
      return;
    }

    const currentMarkdown = codec.serialize(editor);
    let newMarkdown = currentMarkdown;

    const sortedChanges = [...changes].sort((a, b) => b.start - a.start);
    for (const change of sortedChanges) {
      const shadowText = syncClient.getShadowText();
      const adjustedStart = mapOffsetToCurrentText(change.start, shadowText, currentMarkdown);
      const adjustedEnd = mapOffsetToCurrentText(change.end, shadowText, currentMarkdown);

      newMarkdown = newMarkdown.slice(0, adjustedStart) + change.text + newMarkdown.slice(adjustedEnd);
    }

    const doc = codec.parse(newMarkdown);
    editor.commands.setContent(doc);
  }

  function destroy(): void {
    editor.destroy();
  }

  return {
    editor,
    codec,
    destroy,
    setContent,
    applyChanges,
  };
}

function computeChanges(
  editor: Editor,
  codec: MarkdownCodec,
  syncClient: SyncClient,
  onChangeGuardExceeded?: (metrics: DiffResult['metrics']) => void
): Replace[] {
  const shadowText = syncClient.getShadowText();
  const nextMarkdown = codec.serialize(editor);

  if (shadowText === nextMarkdown) {
    return [];
  }

  const diffResult = computeDiff(shadowText, nextMarkdown);

  const config = syncClient.getConfig();
  if (config && isChangeGuardExceeded(diffResult.metrics, config.changeGuard)) {
    if (onChangeGuardExceeded) {
      onChangeGuardExceeded(diffResult.metrics);
    }
    return [];
  }

  syncClient.updateShadowText(nextMarkdown);

  return diffResult.changes;
}

function mapOffsetToCurrentText(
  offset: number,
  _shadowText: string,
  _currentText: string
): number {
  return offset;
}
