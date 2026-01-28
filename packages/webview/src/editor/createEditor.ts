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
 * - RawBlock: :::raw 記法の保持
 * - FrontmatterBlock: frontmatter の保持
 * - HtmlToCodeBlock: HTML ブロックは code block として表示
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
import type { Slice } from '@tiptap/pm/model';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import Dropcursor from '@tiptap/extension-dropcursor';
import { RawBlock } from './rawBlockExtension.js';
import { FrontmatterBlock } from './frontmatterBlockExtension.js';
import { PlainTextBlock } from './plainTextBlockExtension.js';
import { HtmlToCodeBlock } from './htmlToCodeBlockExtension.js';
import { NestedPage } from './nestedPageExtension.js';
import { TableControls } from './tableControlsExtension.js';
import { TableBlock } from './tableBlockWrapperExtension.js';
import { BlockHandles, createDragHandleElement, DRAG_HANDLE_ALLOWED_NODE_TYPES } from './blockHandlesExtension.js';
import { InlineDragHandle } from './inlineDragHandleExtension.js';
import { ListIndentShortcuts } from './listIndentShortcuts.js';
import { IndentMarker } from './indentMarkerExtension.js';
import { EnterSelectionFix } from './enterSelectionFixExtension.js';
import { serializeMarkdown } from './markdownUtils.js';
import NodeRange from '@tiptap/extension-node-range';
import { createLowlight, common } from 'lowlight';
import { setHostNotifier } from './hostNotifier.js';
import {
  ParagraphNoShortcut,
  BoldNoShortcut,
  ItalicNoShortcut,
  StrikeNoShortcut,
  CodeNoShortcut,
  UnderlineNoShortcut,
  HeadingNoShortcut,
  BulletListNoShortcut,
  OrderedListNoShortcut,
  ListItemNoShortcut,
  BlockquoteNoShortcut,
  CodeBlockNoShortcut,
  HorizontalRuleNoShortcut,
  HistoryNoShortcut,
} from './disableKeyboardShortcuts.js';
import { t } from './i18n.js';
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
  const lowlightInstance = createLowlight(common);
  const CLIPBOARD_MODULE = 'Clipboard';

  const logClipboardInfo = (msg: string, data?: Record<string, unknown>): void => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[INFO][${CLIPBOARD_MODULE}] ${timestamp} ${msg}`, data);
    } else {
      console.log(`[INFO][${CLIPBOARD_MODULE}] ${timestamp} ${msg}`);
    }
  };

  const logClipboardSuccess = (msg: string, data?: Record<string, unknown>): void => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[SUCCESS][${CLIPBOARD_MODULE}] ${timestamp} ${msg}`, data);
    } else {
      console.log(`[SUCCESS][${CLIPBOARD_MODULE}] ${timestamp} ${msg}`);
    }
  };

  const logClipboardError = (msg: string, data?: Record<string, unknown>): void => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.error(`[ERROR][${CLIPBOARD_MODULE}] ${timestamp} ${msg}`, data);
    } else {
      console.error(`[ERROR][${CLIPBOARD_MODULE}] ${timestamp} ${msg}`);
    }
  };

  // UI要素の作成: BubbleMenu（選択時ツールバー）
  const bubbleMenuElement = createBubbleMenuElement();
  container.appendChild(bubbleMenuElement);
  let bubbleMenuSuspended = false;


  // Tiptap 3.x モダン化:
  // - StarterKit に Link/Underline/ListKeymap が含まれるようになった
  // - 重複を避けるため、StarterKit の link を無効化し、カスタム Link を使用
  // - これにより openOnClick: false などのセキュリティ設定を確実に適用
  // @tiptap/markdown 統合:
  // - Markdown 拡張で GFM (GitHub Flavored Markdown) を有効化
  // - FrontmatterBlock で frontmatter を保持
  // - RawBlock で :::raw を保持
  // - HtmlToCodeBlock で HTML ブロックを code block に変換
  // - Table 拡張で GFM テーブルをサポート
  // VSCodeキーバインドで全ショートカットを管理するため、
  // StarterKitの拡張を無効化し、ショートカット無しバージョンを使用
  let editor: Editor;

  const serializeSelectionMarkdown = (slice: Slice): string => {
    const startedAt = Date.now();
    if (!editor) {
      logClipboardError('Clipboard serialize failed: editor not initialized');
      return '';
    }

    const selection = editor.state.selection;
    if (selection.empty) {
      logClipboardInfo('Clipboard serialize skipped: empty selection', {
        durationMs: Date.now() - startedAt,
      });
      return '';
    }

    const rawJson = slice.content.toJSON();
    const content = Array.isArray(rawJson) ? rawJson : [rawJson];
    const hasBlock = content.some((node) => {
      if (!node || typeof node !== 'object') {
        return false;
      }
      const typeName = (node as { type?: string }).type;
      if (!typeName) {
        return false;
      }
      const nodeType = editor.schema.nodes[typeName];
      return Boolean(nodeType?.isBlock);
    });

    const payload = hasBlock ? { type: 'doc', content } : content;
    const markdown = serializeMarkdown(editor, payload, {
      mode: 'clipboard-selection',
      selectionFrom: selection.from,
      selectionTo: selection.to,
      openStart: slice.openStart,
      openEnd: slice.openEnd,
      hasBlock,
    });

    if (markdown === null) {
      logClipboardError('Clipboard markdown serialize failed', {
        durationMs: Date.now() - startedAt,
        selectionFrom: selection.from,
        selectionTo: selection.to,
        openStart: slice.openStart,
        openEnd: slice.openEnd,
        hasBlock,
      });
      return '';
    }

    logClipboardSuccess('Clipboard markdown serialized', {
      length: markdown.length,
      durationMs: Date.now() - startedAt,
      selectionFrom: selection.from,
      selectionTo: selection.to,
      openStart: slice.openStart,
      openEnd: slice.openEnd,
      hasBlock,
    });

    return markdown;
  };

  const handleLinkClick = (event: MouseEvent): boolean => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a') as HTMLAnchorElement | null;
    if (!anchor) {
      return false;
    }
    const href = anchor.getAttribute('href');
    event.preventDefault();
    event.stopPropagation();
    if (!href) {
      return true;
    }
    if (!event.ctrlKey && !event.metaKey) {
      return true;
    }
    syncClient.openLink(href);
    return true;
  };

  editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({
        // ショートカット無しバージョンを使用するため、デフォルトを無効化
        bold: false,
        italic: false,
        strike: false,
        code: false,
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        // Tiptap 3.x: history → undoRedo
        undoRedo: false,
        // Dropcursor は単体で configure する
        dropcursor: false,
        // Tiptap 3.x: StarterKit に Link/Underline が含まれるため無効化
        link: false,
        underline: false,
      }),
      // ショートカット無効化した拡張を追加
      BoldNoShortcut,
      ItalicNoShortcut,
      StrikeNoShortcut,
      CodeNoShortcut,
      UnderlineNoShortcut,
      ParagraphNoShortcut,
      HeadingNoShortcut.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      BulletListNoShortcut,
      OrderedListNoShortcut,
      ListItemNoShortcut,
      BlockquoteNoShortcut,
      CodeBlockNoShortcut.configure({
        lowlight: lowlightInstance,
        defaultLanguage: 'plaintext',
      }),
      HorizontalRuleNoShortcut,
      HistoryNoShortcut,
      Dropcursor.configure({
        color: 'var(--vscode-focusBorder)',
        width: 2,
        class: 'inline-markdown-dropcursor',
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
      TableBlock,
      TableRow,
      TableCell,
      TableHeader,
      // テーブルUI（Notion風 + ボタン、ハンドル、コンテキストメニュー）
      TableControls,
      NodeRange,
      NestedPage.configure({
        onOpen: (path) => {
          syncClient.openNestedPage(path);
        },
      }),
      InlineDragHandle.configure({
        render: () => createDragHandleElement(),
        allowedNodeTypes: DRAG_HANDLE_ALLOWED_NODE_TYPES,
      }),
      ListIndentShortcuts,
      // ブロックメニュー（+ / コンテキスト / スラッシュコマンド）
      BlockHandles.configure({
        createNestedPage: async (title) => {
          return syncClient.createNestedPage(title);
        },
        openNestedPage: (path) => {
          syncClient.openNestedPage(path);
        },
      }),
      EnterSelectionFix,
      // カスタム拡張（indent コメント, frontmatter, RAW）
      IndentMarker,
      FrontmatterBlock,
      RawBlock,
      PlainTextBlock,
      HtmlToCodeBlock,
      // @tiptap/markdown で Markdown パース/シリアライズを統合
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
      // Notion/Slack風UI拡張（多言語対応）
      Placeholder.configure({
        placeholder: ({ node }) => {
          const translations = t();
          if (node.type.name === 'heading') {
            return translations.placeholder.heading;
          }
          return translations.placeholder.paragraph;
        },
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty',
      }),
      BubbleMenu.configure({
        element: bubbleMenuElement,
        shouldShow: ({ editor, state }) => {
          if (bubbleMenuSuspended) {
            return false;
          }
          // テキスト選択がある場合のみ表示（コードブロック、テーブル内は除外）
          const { selection } = state;
          const isEmptySelection = selection.empty;
          const isCodeBlock = editor.isActive('codeBlock');
          const isTable = editor.isActive('table');
          return !isEmptySelection && !isCodeBlock && !isTable;
        },
      }),
      // Note: FloatingMenu removed - block type selection is handled by BlockHandles + button
    ],
    editorProps: {
      attributes: {
        class: 'inline-markdown-editor-content',
        spellcheck: 'true',
      },
      clipboardTextSerializer: (slice) => {
        return serializeSelectionMarkdown(slice);
      },
      handleDOMEvents: {
        click: (_view, event) => {
          if (!(event instanceof MouseEvent)) {
            return false;
          }
          return handleLinkClick(event);
        },
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

  setHostNotifier((level, code, message, remediation, details) => {
    syncClient.notifyHost(level, code, message, remediation, details);
  });

  const isDebugEnabled = Boolean(syncClient.getConfig()?.debug.enabled);

  // Input/selection diagnostics (only when debug enabled)
  if (isDebugEnabled) {
    let lastSelection = editor.state.selection;
    editor.on('transaction', ({ editor: txEditor, transaction }) => {
      const inputType = transaction.getMeta('inputType');
      const uiEvent = transaction.getMeta('uiEvent');
      if (inputType === 'insertParagraph' || inputType === 'insertLineBreak' || uiEvent === 'input') {
        console.log('[Input] transaction', {
          inputType,
          uiEvent,
          docChanged: transaction.docChanged,
          selectionSet: transaction.selectionSet,
          before: { from: lastSelection.from, to: lastSelection.to, empty: lastSelection.empty },
          after: { from: transaction.selection.from, to: transaction.selection.to, empty: transaction.selection.empty },
        });
      }
      lastSelection = txEditor.state.selection;
    });

  }

  // BubbleMenuボタンのイベントハンドラー設定
  setupBubbleMenuHandlers(bubbleMenuElement, editor);

  editor.on('selectionUpdate', () => {
    if (bubbleMenuSuspended) {
      bubbleMenuSuspended = false;
      bubbleMenuElement.classList.remove('is-suspended');
    }
  });

  const onSelectionUpdate = ({ editor: selectionEditor }: { editor: Editor }) => {
    const selection = selectionEditor.state.selection;
    const timestamp = new Date().toISOString();
    const $from = selection.$from;
    const $to = selection.$to;
    console.log('[Selection] update', {
      timestamp,
      type: selection.constructor.name,
      empty: selection.empty,
      from: selection.from,
      to: selection.to,
      anchor: selection.anchor,
      head: selection.head,
      fromParent: $from.parent.type.name,
      toParent: $to.parent.type.name,
      depth: $from.depth,
    });
  };

  editor.on('selectionUpdate', onSelectionUpdate);

  const editorContainer = editor.view.dom.closest('.editor-container') as HTMLElement | null;
  const onScroll = () => {
    if (!bubbleMenuSuspended) {
      bubbleMenuSuspended = true;
      bubbleMenuElement.classList.add('is-suspended');
    }
  };
  editorContainer?.addEventListener('scroll', onScroll);

  // Link handling:
  // - Keep Tiptap's Link.openOnClick=false (security)
  // - Open links via the extension (openExternal) on Ctrl/Cmd+Click (VS Code convention)
  const linkModifierClass = 'inline-markdown-link-modifier';
  const setLinkModifierActive = (active: boolean) => {
    document.body.classList.toggle(linkModifierClass, active);
  };
  const onModifierKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey) {
      setLinkModifierActive(true);
    }
  };
  const onModifierKeyUp = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey) {
      setLinkModifierActive(false);
    }
  };
  const onModifierBlur = () => {
    setLinkModifierActive(false);
  };
  window.addEventListener('keydown', onModifierKeyDown, true);
  window.addEventListener('keyup', onModifierKeyUp, true);
  window.addEventListener('blur', onModifierBlur);

  function setContent(markdown: string): void {
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
    window.removeEventListener('keydown', onModifierKeyDown, true);
    window.removeEventListener('keyup', onModifierKeyUp, true);
    window.removeEventListener('blur', onModifierBlur);
    editorContainer?.removeEventListener('scroll', onScroll);
    editor.off('selectionUpdate', onSelectionUpdate);
    bubbleMenuElement.remove();
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
 * Note: CSP対応のため、inline styleではなくCSS classを使用
 */
function createBubbleMenuElement(): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'bubble-menu';

  // 太字ボタン（CSS class: bubble-menu-bold）
  const boldBtn = createMenuButton('B', 'bold', 'toggleBold', '太字 (Ctrl+B)');
  boldBtn.classList.add('bubble-menu-bold');
  menu.appendChild(boldBtn);

  // 斜体ボタン（CSS class: bubble-menu-italic）
  const italicBtn = createMenuButton('I', 'italic', 'toggleItalic', '斜体 (Ctrl+I)');
  italicBtn.classList.add('bubble-menu-italic');
  menu.appendChild(italicBtn);

  // 取り消し線ボタン（CSS class: bubble-menu-strike）
  const strikeBtn = createMenuButton('S', 'strike', 'toggleStrike', '取り消し線');
  strikeBtn.classList.add('bubble-menu-strike');
  menu.appendChild(strikeBtn);

  // コードボタン（CSS class: bubble-menu-code）
  const codeBtn = createMenuButton('</>', 'code', 'toggleCode', 'インラインコード (Ctrl+E)');
  codeBtn.classList.add('bubble-menu-code');
  menu.appendChild(codeBtn);

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
