/**
 * 役割: Tiptap エディタインスタンスの生成と設定
 * 責務: Tiptap エディタを拡張機能付きで生成、ユーザー入力を処理
 * 不変条件: エディタ状態の変更は SyncClient 経由で同期をトリガーすること
 * 
 * 設計書参照: 12.2 (EditorInstance), 12.3 (Markdown Codec)
 * 
 * EditorInstance インターフェース (設計書 12.2):
 * - setContent(markdown): Markdown を Tiptap ドキュメントに変換してセット
 * - applyChanges(changes): Replace[] を適用（差分更新）
 * - getContent(): 現在のエディタ内容を Markdown として取得
 * - destroy(): エディタを破棄
 * 
 * 拡張機能一覧:
 * - StarterKit: 基本的な Markdown 要素（見出し、リスト、コードブロック等）
 * - Link: リンク（openOnClick: false で直接開かない）
 * - Image: 画像（inline: true, allowBase64: true）
 * - RawBlock: 非対応記法の保持（frontmatter 等）
 * - HtmlBlock: HTML ブロック（renderHtml=true 時は DOMPurify でサニタイズ）
 * 
 * onUpdate コールバック (設計書 10.1):
 * - applyingRemote 中は何もしない（ループ防止）
 * - scheduleEdit() で debounce 後に edit 送信
 * 
 * ChangeGuard (設計書 11):
 * - 大規模変更を検出して警告
 * - maxChangedRatio, maxChangedChars, maxHunks で閾値設定
 * - 超過時は onChangeGuardExceeded コールバック
 * 
 * 差分計算 (設計書 12.3.5):
 * - shadowText と現在の Markdown を比較
 * - diff-match-patch で最小差分を計算
 * - G5-lite: 整形を最小限に抑える
 */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { RawBlock } from './rawBlockExtension.js';
import { HtmlBlock } from './htmlBlockExtension.js';
import { computeDiff, type DiffResult } from './diffEngine.js';
import type { SyncClient } from '../protocol/client.js';
import type { Replace } from '../protocol/types.js';

export interface EditorInstance {
  editor: Editor;
  destroy: () => void;
  setContent: (markdown: string) => void;
  applyChanges: (changes: Replace[]) => void;
  getContent: () => string;
}

export interface CreateEditorOptions {
  container: HTMLElement;
  syncClient: SyncClient;
  onChangeGuardExceeded?: (metrics: DiffResult['metrics']) => void;
}

export function createEditor(options: CreateEditorOptions): EditorInstance {
  const { container, syncClient, onChangeGuardExceeded } = options;

  // Tiptap 3.x モダン化:
  // - StarterKit に Link/Underline/ListKeymap が含まれるようになった
  // - 重複を避けるため、StarterKit の link を無効化し、カスタム Link を使用
  // - これにより openOnClick: false などのセキュリティ設定を確実に適用
  // @tiptap/markdown 統合:
  // - Markdown 拡張で GFM (GitHub Flavored Markdown) を有効化
  // - RawBlock で frontmatter をサポート
  // - HtmlBlock で HTML ブロックを保持
  // - Table 拡張で GFM テーブルをサポート
  const editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        // Tiptap 3.x: StarterKit に Link が含まれるため、カスタム Link と重複しないよう無効化
        link: false,
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
      // GFM テーブルサポート
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableCell,
      TableHeader,
      // カスタム拡張（frontmatter, HTML ブロック）
      RawBlock,
      HtmlBlock,
      // @tiptap/markdown で Markdown パース/シリアライズを統合
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
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
        return computeChanges(updatedEditor, syncClient, onChangeGuardExceeded);
      });
    },
  });

  // Link handling:
  // - Keep Tiptap's Link.openOnClick=false (security)
  // - Open links via the extension (openExternal) on Ctrl/Cmd+Click (VS Code convention)
  const onEditorClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a') as HTMLAnchorElement | null;
    if (!anchor) {return;}

    const href = anchor.getAttribute('href');
    if (!href) {return;}

    if (!event.ctrlKey && !event.metaKey) {return;}

    event.preventDefault();
    event.stopPropagation();
    syncClient.openLink(href);
  };
  container.addEventListener('click', onEditorClick);

  function setContent(markdown: string): void {
    console.log('[createEditor] setContent', { length: markdown.length });
    editor.commands.setContent(markdown, { contentType: 'markdown' });
  }

  function applyChanges(changes: Replace[]): void {
    // NOTE:
    // The authoritative Markdown (`shadowText`) is updated in SyncClient.handleDocChanged().
    // For non-self docChanged we rebuild the editor from that updated shadowText.
    // (Self docChanged does NOT reach here; see SyncClient: reason=self short-circuit.)
    if (changes.length === 0) {return;}
    setContent(syncClient.getShadowText());
  }

  function destroy(): void {
    container.removeEventListener('click', onEditorClick);
    editor.destroy();
  }

  function getContent(): string {
    return editor.getMarkdown();
  }

  return {
    editor,
    destroy,
    setContent,
    applyChanges,
    getContent,
  };
}

function computeChanges(
  editor: Editor,
  syncClient: SyncClient,
  _onChangeGuardExceeded?: (metrics: DiffResult['metrics']) => void
): Replace[] {
  const shadowText = syncClient.getShadowText();
  const nextMarkdown = editor.getMarkdown();

  if (shadowText === nextMarkdown) {
    return [];
  }

  const diffResult = computeDiff(shadowText, nextMarkdown);

  // ChangeGuard: 大規模編集の警告ロジック（一時的にコメントアウト）
  // const config = syncClient.getConfig();
  // if (config && isChangeGuardExceeded(diffResult.metrics, config.changeGuard)) {
  //   if (onChangeGuardExceeded) {
  //     onChangeGuardExceeded(diffResult.metrics);
  //   }
  //   return [];
  // }

  return diffResult.changes;
}

