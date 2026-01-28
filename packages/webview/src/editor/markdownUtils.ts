/**
 * Markdown manager helpers
 * - Centralize access to editor.markdown / storage.markdown.manager
 * - Provide parse/serialize with explicit error logging
 */

import type { Editor } from '@tiptap/core';
import { notifyHostError } from './hostNotifier.js';

let markdownManagerUnavailableNotified = false;

export type MarkdownManager = {
  parse: (markdown: string) => { type: string; content?: unknown };
  serialize: (json: unknown) => string;
};

const getManager = (editor: Editor): MarkdownManager | null => {
  const anyEditor = editor as unknown as {
    markdown?: { parse?: (markdown: string) => any; serialize?: (json: unknown) => string };
    storage?: { markdown?: { manager?: { parse?: (markdown: string) => any; serialize?: (json: unknown) => string } } };
  };

  const manager = anyEditor.markdown ?? anyEditor.storage?.markdown?.manager ?? null;
  if (!manager || typeof manager.parse !== 'function' || typeof manager.serialize !== 'function') {
    return null;
  }

  return manager as MarkdownManager;
};

export const getMarkdownManager = (editor: Editor): MarkdownManager | null => {
  const manager = getManager(editor);
  if (manager) {
    markdownManagerUnavailableNotified = false;
    return manager;
  }
  if (!markdownManagerUnavailableNotified) {
    notifyHostError('MARKDOWN_MANAGER_UNAVAILABLE', 'Markdown マネージャが利用できません。', {
      hasEditorMarkdown: Boolean((editor as unknown as { markdown?: unknown }).markdown),
      hasStorageMarkdown: Boolean((editor as unknown as { storage?: { markdown?: unknown } }).storage?.markdown),
    });
    markdownManagerUnavailableNotified = true;
  }
  return null;
};

export const serializeMarkdown = (
  editor: Editor,
  json: unknown,
  context: Record<string, unknown> = {}
): string | null => {
  const manager = getMarkdownManager(editor);
  if (!manager) {
    return null;
  }
  try {
    return manager.serialize(json);
  } catch (error) {
    notifyHostError('MARKDOWN_SERIALIZE_FAILED', 'Markdown への変換に失敗しました。', {
      ...context,
      error: String(error),
    });
    return null;
  }
};

export const parseMarkdown = (
  editor: Editor,
  markdown: string,
  context: Record<string, unknown> = {}
): { type: string; content?: unknown } | null => {
  const manager = getMarkdownManager(editor);
  if (!manager) {
    return null;
  }
  try {
    return manager.parse(markdown);
  } catch (error) {
    notifyHostError('MARKDOWN_PARSE_FAILED', 'Markdown の解析に失敗しました。', {
      ...context,
      error: String(error),
    });
    return null;
  }
};
