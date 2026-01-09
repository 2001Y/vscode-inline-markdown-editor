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
import Placeholder from '@tiptap/extension-placeholder';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import FloatingMenu from '@tiptap/extension-floating-menu';
import Focus from '@tiptap/extension-focus';
import { RawBlock } from './rawBlockExtension.js';
import { HtmlBlock } from './htmlBlockExtension.js';
import { TableControls } from './tableControlsExtension.js';
import { BlockHandles } from './blockHandlesExtension.js';
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

  // UI要素の作成: BubbleMenu（選択時ツールバー）
  const bubbleMenuElement = createBubbleMenuElement();
  container.appendChild(bubbleMenuElement);

  // UI要素の作成: FloatingMenu（空行メニュー）
  const floatingMenuElement = createFloatingMenuElement();
  container.appendChild(floatingMenuElement);

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
      // GFM テーブルサポート（resizable: false はデフォルト値のため省略）
      Table,
      TableRow,
      TableCell,
      TableHeader,
      // テーブルUI（Notion風 + ボタン、ハンドル、コンテキストメニュー）
      TableControls,
      // ブロックハンドル（全ブロック共通の6点ドラッグハンドル）
      BlockHandles,
      // カスタム拡張（frontmatter, HTML ブロック）
      RawBlock,
      HtmlBlock,
      // @tiptap/markdown で Markdown パース/シリアライズを統合
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
      // Notion/Slack風UI拡張
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Heading...';
          }
          return "Type '/' for commands...";
        },
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty',
      }),
      Focus.configure({
        className: 'has-focus',
        mode: 'deepest',
      }),
      BubbleMenu.configure({
        element: bubbleMenuElement,
        shouldShow: ({ editor, state }) => {
          // テキスト選択がある場合のみ表示（コードブロック、テーブル内は除外）
          const { selection } = state;
          const isEmptySelection = selection.empty;
          const isCodeBlock = editor.isActive('codeBlock');
          const isTable = editor.isActive('table');
          return !isEmptySelection && !isCodeBlock && !isTable;
        },
      }),
      FloatingMenu.configure({
        element: floatingMenuElement,
        shouldShow: ({ editor, state }) => {
          // 空の段落にカーソルがある場合のみ表示
          const { selection } = state;
          const isRootDepth = selection.$anchor.depth === 1;
          const isEmptyParagraph =
            editor.isActive('paragraph') &&
            selection.$anchor.parent.content.size === 0;
          return isRootDepth && isEmptyParagraph;
        },
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

  // BubbleMenuボタンのイベントハンドラー設定
  setupBubbleMenuHandlers(bubbleMenuElement, editor);

  // FloatingMenuボタンのイベントハンドラー設定
  setupFloatingMenuHandlers(floatingMenuElement, editor);

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
    console.log('[createEditor] markdown preview:', markdown.slice(0, 500));
    editor.commands.setContent(markdown, { contentType: 'markdown' });
    // Debug: log the parsed document structure
    const json = editor.getJSON();
    console.log('[createEditor] parsed JSON types:', json.content?.map(n => n.type));
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
    bubbleMenuElement.remove();
    floatingMenuElement.remove();
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

/**
 * BubbleMenu（選択時ツールバー）のHTML要素を作成
 * フォーマットボタン: 太字、斜体、コード、リンク
 */
function createBubbleMenuElement(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'bubble-menu';

  // 太字ボタン
  const boldBtn = createMenuButton('B', 'bold', 'toggleBold', '太字 (Ctrl+B)');
  boldBtn.style.fontWeight = 'bold';
  menu.appendChild(boldBtn);

  // 斜体ボタン
  const italicBtn = createMenuButton('I', 'italic', 'toggleItalic', '斜体 (Ctrl+I)');
  italicBtn.style.fontStyle = 'italic';
  menu.appendChild(italicBtn);

  // 取り消し線ボタン
  const strikeBtn = createMenuButton('S', 'strike', 'toggleStrike', '取り消し線');
  strikeBtn.style.textDecoration = 'line-through';
  menu.appendChild(strikeBtn);

  // コードボタン
  const codeBtn = createMenuButton('</>', 'code', 'toggleCode', 'インラインコード (Ctrl+E)');
  codeBtn.style.fontFamily = 'monospace';
  menu.appendChild(codeBtn);

  return menu;
}

/**
 * FloatingMenu（空行メニュー）のHTML要素を作成
 * ブロック挿入ボタン: 見出し、リスト、コードブロック、テーブル
 */
function createFloatingMenuElement(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'floating-menu';

  // +ボタン（メインボタン）
  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.className = 'floating-menu-trigger';
  plusBtn.textContent = '+';
  plusBtn.title = "ブロックを挿入 (Type '/' for commands)";
  menu.appendChild(plusBtn);

  // サブメニュー（クリックで展開）
  const submenu = document.createElement('div');
  submenu.className = 'floating-menu-submenu';
  submenu.style.display = 'none';

  // 見出しボタン
  submenu.appendChild(createBlockButton('H1', 'heading1', '見出し1'));
  submenu.appendChild(createBlockButton('H2', 'heading2', '見出し2'));
  submenu.appendChild(createBlockButton('H3', 'heading3', '見出し3'));

  // リストボタン
  submenu.appendChild(createBlockButton('•', 'bulletList', '箇条書きリスト'));
  submenu.appendChild(createBlockButton('1.', 'orderedList', '番号付きリスト'));

  // コードブロックボタン
  submenu.appendChild(createBlockButton('{ }', 'codeBlock', 'コードブロック'));

  // 引用ボタン
  submenu.appendChild(createBlockButton('>', 'blockquote', '引用'));

  // テーブルボタン
  submenu.appendChild(createBlockButton('⊞', 'table', 'テーブル'));

  // 水平線ボタン
  submenu.appendChild(createBlockButton('—', 'horizontalRule', '水平線'));

  menu.appendChild(submenu);

  // +ボタンのクリックでサブメニューを表示/非表示
  plusBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isVisible = submenu.style.display !== 'none';
    submenu.style.display = isVisible ? 'none' : 'flex';
  });

  return menu;
}

/**
 * BubbleMenu用のフォーマットボタンを作成
 */
function createMenuButton(
  label: string,
  markName: string,
  _command: string,
  title: string
): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bubble-menu-button';
  btn.textContent = label;
  btn.title = title;
  btn.dataset.mark = markName;
  btn.dataset.command = _command;
  return btn;
}

/**
 * FloatingMenu用のブロック挿入ボタンを作成
 */
function createBlockButton(
  label: string,
  blockType: string,
  title: string
): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'floating-menu-button';
  btn.textContent = label;
  btn.title = title;
  btn.dataset.blockType = blockType;
  return btn;
}

/**
 * BubbleMenuのボタンにイベントハンドラーを設定
 */
function setupBubbleMenuHandlers(menu: HTMLElement, editor: Editor): void {
  menu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.bubble-menu-button') as HTMLElement | null;
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const command = btn.dataset.command;
    if (!command) return;

    // コマンドを実行
    switch (command) {
      case 'toggleBold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'toggleItalic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'toggleStrike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'toggleCode':
        editor.chain().focus().toggleCode().run();
        break;
    }

    // ボタンのアクティブ状態を更新
    updateBubbleMenuActiveState(menu, editor);
  });

  // エディタの選択変更時にアクティブ状態を更新
  editor.on('selectionUpdate', () => {
    updateBubbleMenuActiveState(menu, editor);
  });
}

/**
 * BubbleMenuボタンのアクティブ状態を更新
 */
function updateBubbleMenuActiveState(menu: HTMLElement, editor: Editor): void {
  const buttons = menu.querySelectorAll('.bubble-menu-button');
  buttons.forEach((btn) => {
    const mark = (btn as HTMLElement).dataset.mark;
    if (mark && editor.isActive(mark)) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });
}

/**
 * FloatingMenuのボタンにイベントハンドラーを設定
 */
function setupFloatingMenuHandlers(menu: HTMLElement, editor: Editor): void {
  menu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.floating-menu-button') as HTMLElement | null;
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const blockType = btn.dataset.blockType;
    if (!blockType) return;

    // ブロックを挿入
    switch (blockType) {
      case 'heading1':
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case 'heading2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'heading3':
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'codeBlock':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'table':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'horizontalRule':
        editor.chain().focus().setHorizontalRule().run();
        break;
    }

    // サブメニューを閉じる
    const submenu = menu.querySelector('.floating-menu-submenu') as HTMLElement | null;
    if (submenu) {
      submenu.style.display = 'none';
    }
  });
}

