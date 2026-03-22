/**
 * Find/Replace widget for inlineMark (VS Code-like)
 * - Webview DOM UI + prosemirror-search integration
 * - No document mutation for search state updates
 */

import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import {
  SearchQuery,
  getMatchHighlights,
  setSearchState,
} from 'prosemirror-search';
import { createIconElement } from './icons.js';
import { t } from './i18n.js';
import { setActiveSearchMatch } from './searchExtension.js';
import { createLogger } from '../logger.js';

export type FindWidgetState = {
  visible: boolean;
  replaceVisible: boolean;
  query: string;
  replace: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
  preserveCase: boolean;
  inSelection: boolean;
  width?: number;
  height?: number;
};

export type FindWidgetApi = {
  openFind: (options?: { seedFromSelection?: boolean }) => void;
  openReplace: (options?: { seedFromSelection?: boolean }) => void;
  close: () => void;
  findNext: () => void;
  findPrev: () => void;
  replaceNext: () => void;
  replaceAll: () => void;
  toggleMatchCase: () => void;
  toggleWholeWord: () => void;
  toggleRegex: () => void;
  toggleFindInSelection: () => void;
  togglePreserveCase: () => void;
  isVisible: () => boolean;
  destroy: () => void;
  getState: () => FindWidgetState;
  restoreState: (state?: FindWidgetState) => void;
};

const MODULE = 'FindWidget';
const logger = createLogger(MODULE);

const log = (
  level: 'INFO' | 'DEBUG' | 'STATES' | 'SUCCESS' | 'WARNING' | 'ERROR',
  message: string,
  details?: Record<string, unknown>
): void => {
  switch (level) {
    case 'INFO':
      logger.info(message, details);
      return;
    case 'DEBUG':
      logger.debug(message, details);
      return;
    case 'STATES':
      logger.states(message, details);
      return;
    case 'SUCCESS':
      logger.success(message, details);
      return;
    case 'WARNING':
      logger.warn(message, details);
      return;
    case 'ERROR':
      logger.error(message, details);
      return;
  }
};

const createActionButton = (iconName: Parameters<typeof createIconElement>[0], title: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'find-action-button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.appendChild(createIconElement(iconName));
  return button;
};

const createToggleButton = (iconName: Parameters<typeof createIconElement>[0], title: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'find-toggle';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.appendChild(createIconElement(iconName));
  return button;
};

const toSelectionRange = (editor: Editor): { from: number; to: number } | null => {
  const selection = editor.state.selection;
  if (selection.empty) {
    return null;
  }
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  if (from === to) {
    return null;
  }
  return { from, to };
};

const getSelectedText = (editor: Editor): string | null => {
  const selection = editor.state.selection;
  if (selection.empty) {
    return null;
  }
  const text = editor.state.doc.textBetween(selection.from, selection.to, '\n', '\n');
  return text || null;
};

const getWordAtCursor = (editor: Editor): string | null => {
  const { $from } = editor.state.selection;
  const text = $from.parent.textBetween(0, $from.parent.content.size, '\n', '\n');
  if (!text) {
    return null;
  }
  const offset = $from.parentOffset;
  const left = text.slice(0, offset);
  const right = text.slice(offset);
  const leftMatch = left.match(/[A-Za-z0-9_]+$/);
  const rightMatch = right.match(/^[A-Za-z0-9_]+/);
  const word = `${leftMatch?.[0] ?? ''}${rightMatch?.[0] ?? ''}`;
  return word || null;
};

const applyPreserveCase = (matchedText: string, replacement: string): string => {
  if (!replacement) {
    return replacement;
  }
  if (matchedText.toUpperCase() === matchedText) {
    return replacement.toUpperCase();
  }
  if (matchedText.toLowerCase() === matchedText) {
    return replacement.toLowerCase();
  }
  const first = matchedText.charAt(0);
  const rest = matchedText.slice(1);
  if (first.toUpperCase() === first && rest.toLowerCase() === rest) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
};

export const createFindWidget = (options: {
  editor: Editor;
  container: HTMLElement;
  scrollContainer?: HTMLElement;
  onVisibilityChange?: (visible: boolean) => void;
  onStateChange?: (state: FindWidgetState) => void;
}): FindWidgetApi => {
  const { editor, container, scrollContainer, onVisibilityChange, onStateChange } = options;
  const labels = t().findWidget;

  const widget = document.createElement('div');
  widget.className = 'find-widget';
  widget.setAttribute('role', 'dialog');

  const layout = document.createElement('div');
  layout.className = 'find-layout';
  widget.appendChild(layout);

  const toggleArea = document.createElement('div');
  toggleArea.className = 'find-toggle-area';

  const groupStack = document.createElement('div');
  groupStack.className = 'find-group-stack';

  const metaStack = document.createElement('div');
  metaStack.className = 'find-meta-stack';

  const toggleReplaceButton = createActionButton('chevronRight', labels.toggleReplace);
  toggleReplaceButton.classList.add('find-toggle-replace');
  toggleArea.appendChild(toggleReplaceButton);

  const findInput = document.createElement('textarea');
  findInput.className = 'find-input';
  findInput.rows = 1;
  findInput.spellcheck = false;
  findInput.setAttribute('aria-label', labels.findPlaceholder);
  findInput.setAttribute('placeholder', labels.findPlaceholder);

  const inputGroup = document.createElement('div');
  inputGroup.className = 'find-input-group';

  const toggles = document.createElement('div');
  toggles.className = 'find-toggles';

  const matchCaseBtn = createToggleButton('caseSensitive', labels.matchCase);
  const wholeWordBtn = createToggleButton('wholeWord', labels.wholeWord);
  const regexBtn = createToggleButton('regex', labels.regex);
  const selectionBtn = createToggleButton('selection', labels.selection);
  const preserveCaseBtn = createToggleButton('preserveCase', labels.preserveCase);

  toggles.appendChild(matchCaseBtn);
  toggles.appendChild(wholeWordBtn);
  toggles.appendChild(regexBtn);
  inputGroup.appendChild(findInput);
  inputGroup.appendChild(toggles);

  const sideActions = document.createElement('div');
  sideActions.className = 'find-side-actions';
  const prevBtn = createActionButton('arrowUp', labels.findPrevious);
  const nextBtn = createActionButton('arrowDown', labels.findNext);
  const closeBtn = createActionButton('close', labels.close);
  sideActions.appendChild(prevBtn);
  sideActions.appendChild(nextBtn);
  sideActions.appendChild(selectionBtn);
  sideActions.appendChild(closeBtn);

  const replaceGroup = document.createElement('div');
  replaceGroup.className = 'find-input-group is-replace';

  const replaceInput = document.createElement('textarea');
  replaceInput.className = 'replace-input';
  replaceInput.rows = 1;
  replaceInput.spellcheck = false;
  replaceInput.setAttribute('aria-label', labels.replacePlaceholder);
  replaceInput.setAttribute('placeholder', labels.replacePlaceholder);

  const replaceToggles = document.createElement('div');
  replaceToggles.className = 'find-replace-toggles';
  replaceToggles.appendChild(preserveCaseBtn);

  replaceGroup.appendChild(replaceInput);
  replaceGroup.appendChild(replaceToggles);

  const replaceActions = document.createElement('div');
  replaceActions.className = 'replace-actions';
  const replaceBtn = createActionButton('replace', labels.replace);
  replaceBtn.classList.add('replace-action-button');
  const replaceAllBtn = createActionButton('replaceAll', labels.replaceAll);
  replaceAllBtn.classList.add('replace-action-button');
  replaceActions.appendChild(replaceBtn);
  replaceActions.appendChild(replaceAllBtn);

  groupStack.appendChild(inputGroup);
  groupStack.appendChild(replaceGroup);

  const count = document.createElement('div');
  count.className = 'find-count';
  count.textContent = '0';

  metaStack.appendChild(count);
  metaStack.appendChild(replaceActions);

  const status = document.createElement('div');
  status.className = 'find-status';

  layout.appendChild(toggleArea);
  layout.appendChild(groupStack);
  layout.appendChild(metaStack);
  layout.appendChild(sideActions);

  widget.appendChild(status);
  container.appendChild(widget);

  let selectionRange: { from: number; to: number } | null = null;
  let state: FindWidgetState = {
    visible: false,
    replaceVisible: false,
    query: '',
    replace: '',
    matchCase: false,
    wholeWord: false,
    regex: false,
    preserveCase: false,
    inSelection: false,
  };

  let pendingSearchUpdate: number | null = null;
  let activeIndex = -1;
  let dragState:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        startLeft: number;
        startTop: number;
        containerRect: DOMRect;
      }
    | null = null;

  const syncState = (reason: string): void => {
    onStateChange?.(state);
    log('STATES', `State updated (${reason})`, { state });
  };

  const setStatus = (message: string, level: 'WARNING' | 'ERROR' | 'INFO' = 'INFO'): void => {
    status.textContent = message;
    status.dataset.level = level;
    status.classList.toggle('is-empty', !message);
  };

  const ensureMatchVisible = (range: { from: number; to: number }, reason: string): void => {
    if (!scrollContainer) {
      return;
    }
    const start = editor.view.coordsAtPos(range.from);
    const end = editor.view.coordsAtPos(range.to);
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    const containerRect = scrollContainer.getBoundingClientRect();
    const padding = 12;
    const viewTop = containerRect.top + padding;
    const viewBottom = containerRect.bottom - padding;
    if (top >= viewTop && bottom <= viewBottom) {
      return;
    }
    const targetCenter = (top + bottom) / 2;
    const viewCenter = (containerRect.top + containerRect.bottom) / 2;
    const delta = targetCenter - viewCenter;
    if (delta !== 0) {
      scrollContainer.scrollTop += delta;
      log('DEBUG', 'Find match scrolled (manual)', { reason, delta: Math.round(delta) });
    }
  };

  const setActiveMatch = (
    range: { from: number; to: number } | null,
    reason: string,
    options?: { shouldScroll?: boolean }
  ): void => {
    const tr = editor.state.tr;
    setActiveSearchMatch(tr, range);
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
    if (range) {
      if (options?.shouldScroll !== false) {
        ensureMatchVisible(range, reason);
      }
      log('INFO', 'Find match activated', { reason, from: range.from, to: range.to });
    } else {
      log('INFO', 'Find match cleared', { reason });
    }
  };

  const getMatches = (): Array<{ from: number; to: number }> => {
    return getMatchHighlights(editor.state).find();
  };

  const setVisibility = (visible: boolean): void => {
    const hadClass = widget.classList.contains('is-visible');
    if (state.visible === visible) {
      if (hadClass !== visible) {
        widget.classList.toggle('is-visible', visible);
        log('WARNING', 'Find widget visibility desynced; forcing class update', {
          expectedVisible: visible,
          hadClass,
        });
      }
      return;
    }
    state = { ...state, visible };
    widget.classList.toggle('is-visible', visible);
    onVisibilityChange?.(visible);
    syncState('visibility');
    log('INFO', visible ? 'Find widget opened' : 'Find widget closed');
  };

  const setReplaceVisible = (visible: boolean): void => {
    if (state.replaceVisible === visible) {
      return;
    }
    state = { ...state, replaceVisible: visible };
    widget.classList.toggle('is-replace-visible', visible);
    toggleReplaceButton.classList.toggle('is-open', visible);
    toggleReplaceButton.replaceChildren(createIconElement(visible ? 'chevronDown' : 'chevronRight'));
    syncState('replace-visibility');
  };

  const isDragTarget = (target: EventTarget | null): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (
      target.closest('button, textarea, input, select, option, label, [contenteditable="true"], .find-input-group')
    ) {
      return false;
    }
    return widget.contains(target);
  };

  const clamp = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const widgetRect = widget.getBoundingClientRect();
    const maxLeft = Math.max(0, dragState.containerRect.width - widgetRect.width);
    const maxTop = Math.max(0, dragState.containerRect.height - widgetRect.height);
    const nextLeft = clamp(dragState.startLeft + deltaX, 0, maxLeft);
    const nextTop = clamp(dragState.startTop + deltaY, 0, maxTop);
    widget.style.left = `${Math.round(nextLeft)}px`;
    widget.style.top = `${Math.round(nextTop)}px`;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    event.preventDefault();
    widget.classList.remove('is-dragging');
    log('INFO', 'Find widget drag end', {
      left: widget.style.left,
      top: widget.style.top,
    });
    dragState = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    if (!isDragTarget(event.target)) {
      return;
    }
    const widgetRect = widget.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const startLeft = widgetRect.left - containerRect.left;
    const startTop = widgetRect.top - containerRect.top;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft,
      startTop,
      containerRect,
    };
    widget.style.right = 'auto';
    widget.style.left = `${Math.round(startLeft)}px`;
    widget.style.top = `${Math.round(startTop)}px`;
    widget.classList.add('is-dragging');
    log('INFO', 'Find widget drag start', { startLeft: Math.round(startLeft), startTop: Math.round(startTop) });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const updateToggleUI = (): void => {
    matchCaseBtn.classList.toggle('is-active', state.matchCase);
    wholeWordBtn.classList.toggle('is-active', state.wholeWord);
    regexBtn.classList.toggle('is-active', state.regex);
    selectionBtn.classList.toggle('is-active', state.inSelection);
    preserveCaseBtn.classList.toggle('is-active', state.preserveCase);
    const hasSelection = Boolean(toSelectionRange(editor));
    const selectionDisabled = !hasSelection && !state.inSelection;
    selectionBtn.disabled = selectionDisabled;
    selectionBtn.classList.toggle('is-disabled', selectionDisabled);
  };

  const buildQuery = (replaceOverride?: string): SearchQuery => {
    return new SearchQuery({
      search: state.query,
      replace: replaceOverride ?? state.replace,
      caseSensitive: state.matchCase,
      regexp: state.regex,
      wholeWord: state.wholeWord,
    });
  };

  const buildReplacement = (matchedText: string): string => {
    if (state.preserveCase && !state.regex) {
      return applyPreserveCase(matchedText, state.replace);
    }
    return state.replace;
  };

  const replaceMatchAt = (match: { from: number; to: number }): boolean => {
    const matchedText = editor.state.doc.textBetween(match.from, match.to, '\n', '\n');
    const replacement = buildReplacement(matchedText);
    const replacementQuery = buildQuery(replacement);
    const replacements = replacementQuery.getReplacements(editor.state, {
      from: match.from,
      to: match.to,
      match: null,
      matchStart: match.from,
    });
    if (replacements.length === 0) {
      return false;
    }
    const tr = editor.state.tr;
    for (let i = replacements.length - 1; i >= 0; i -= 1) {
      const { from: replaceFrom, to: replaceTo, insert } = replacements[i];
      tr.replace(replaceFrom, replaceTo, insert);
    }
    editor.view.dispatch(tr);
    return true;
  };

  const replaceMatches = (matches: Array<{ from: number; to: number }>): boolean => {
    if (matches.length === 0) {
      return false;
    }
    const tr = editor.state.tr;
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const match = matches[i];
      const matchedText = editor.state.doc.textBetween(match.from, match.to, '\n', '\n');
      const replacement = buildReplacement(matchedText);
      const replacementQuery = buildQuery(replacement);
      const replacements = replacementQuery.getReplacements(editor.state, {
        from: match.from,
        to: match.to,
        match: null,
        matchStart: match.from,
      });
      for (let j = replacements.length - 1; j >= 0; j -= 1) {
        const { from: replaceFrom, to: replaceTo, insert } = replacements[j];
        tr.replace(replaceFrom, replaceTo, insert);
      }
    }
    editor.view.dispatch(tr);
    return true;
  };

  const applySearchState = (reason: string, options?: { resetActive?: boolean; shouldScroll?: boolean }): void => {
    const startedAt = performance.now();
    const query = buildQuery();
    const range = state.inSelection ? selectionRange : null;
    const tr = editor.state.tr;
    setSearchState(tr, query, range).setMeta('addToHistory', false);
    editor.view.dispatch(tr);
    syncMatches(query.valid, reason, options?.resetActive ?? true, {
      shouldScroll: options?.shouldScroll,
    });
    widget.classList.toggle('is-invalid', !query.valid && state.query.length > 0);
    const durationMs = Math.round(performance.now() - startedAt);
    log('INFO', 'Search state applied', {
      reason,
      queryLength: state.query.length,
      valid: query.valid,
      durationMs,
      range: range ? { ...range } : null,
    });
  };

  const scheduleSearchUpdate = (reason: string): void => {
    if (pendingSearchUpdate) {
      window.clearTimeout(pendingSearchUpdate);
    }
    pendingSearchUpdate = window.setTimeout(() => {
      pendingSearchUpdate = null;
      applySearchState(reason);
    }, 80);
  };

  const syncMatches = (
    valid: boolean,
    reason: string,
    resetActive: boolean,
    options?: { shouldScroll?: boolean }
  ): void => {
    const startedAt = performance.now();
    if (state.query.length === 0) {
      count.textContent = '0';
      setStatus('', 'INFO');
      activeIndex = -1;
      setActiveMatch(null, reason, options);
      log('DEBUG', 'Match count cleared (empty query)', {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }
    if (!valid) {
      count.textContent = '—';
      setStatus(labels.status.invalidRegex, 'ERROR');
      activeIndex = -1;
      setActiveMatch(null, reason, options);
      log('WARNING', 'Invalid search query', { query: state.query, regex: state.regex });
      return;
    }
    const matches = getMatches();
    const total = matches.length;
    if (total === 0) {
      count.textContent = '0';
      setStatus('', 'INFO');
      activeIndex = -1;
      setActiveMatch(null, reason, options);
      log('DEBUG', 'Match count updated', {
        total,
        activeIndex,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }
    if (resetActive || activeIndex < 0 || activeIndex >= total) {
      activeIndex = 0;
    }
    count.textContent = `${activeIndex + 1}/${total}`;
    setStatus('', 'INFO');
    setActiveMatch(matches[activeIndex], reason, options);
    log('DEBUG', 'Match count updated', {
      total,
      activeIndex,
      durationMs: Math.round(performance.now() - startedAt),
    });
  };

  const ensureSelectionRange = (): boolean => {
    const range = toSelectionRange(editor);
    if (!range) {
      state = { ...state, inSelection: false };
      selectionRange = null;
      updateToggleUI();
      setStatus(labels.status.noSelection, 'WARNING');
      log('WARNING', 'Find in selection ignored: empty selection');
      return false;
    }
    selectionRange = range;
    return true;
  };

  const updateFromInput = (): void => {
    state = { ...state, query: findInput.value };
    syncState('query');
    scheduleSearchUpdate('input');
  };

  const updateReplacement = (): void => {
    state = { ...state, replace: replaceInput.value };
    syncState('replace');
    scheduleSearchUpdate('replace-input');
  };

  const openFind = (options?: { seedFromSelection?: boolean; showReplace?: boolean }): void => {
    const seedFromSelection = options?.seedFromSelection ?? true;
    const showReplace = options?.showReplace ?? false;

    const wasHidden = !state.visible;
    if (wasHidden) {
      setVisibility(true);
    }
    setReplaceVisible(showReplace);

    if (seedFromSelection) {
      const selected = getSelectedText(editor) ?? getWordAtCursor(editor);
      if (selected && selected !== state.query) {
        findInput.value = selected;
        state = { ...state, query: selected };
        syncState('seed-selection');
        applySearchState('seed-selection', { resetActive: true });
      }
    }

    if (wasHidden) {
      applySearchState('open', { resetActive: true });
    }

    findInput.focus();
    findInput.select();
  };

  const close = (): void => {
    if (!state.visible) {
      return;
    }
    setVisibility(false);
    const tr = editor.state.tr;
    setSearchState(tr, new SearchQuery({ search: '' }), null).setMeta('addToHistory', false);
    editor.view.dispatch(tr);
    activeIndex = -1;
    setActiveMatch(null, 'close');
    editor.view.focus();
  };

  const handleFindNext = (): void => {
    if (!state.query) {
      setStatus(labels.status.enterSearchTerm, 'INFO');
      log('WARNING', 'Find next ignored: empty query');
      return;
    }
    applySearchState('find-next', { resetActive: false, shouldScroll: false });
    const matches = getMatches();
    if (matches.length === 0) {
      setStatus(labels.status.noMatches, 'WARNING');
      log('WARNING', 'Find next: no match');
      return;
    }
    activeIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % matches.length;
    setActiveMatch(matches[activeIndex], 'find-next');
    count.textContent = `${activeIndex + 1}/${matches.length}`;
    log('SUCCESS', 'Find next executed');
  };

  const handleFindPrev = (): void => {
    if (!state.query) {
      setStatus(labels.status.enterSearchTerm, 'INFO');
      log('WARNING', 'Find prev ignored: empty query');
      return;
    }
    applySearchState('find-prev', { resetActive: false, shouldScroll: false });
    const matches = getMatches();
    if (matches.length === 0) {
      setStatus(labels.status.noMatches, 'WARNING');
      log('WARNING', 'Find prev: no match');
      return;
    }
    if (activeIndex < 0) {
      activeIndex = matches.length - 1;
    } else {
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
    }
    setActiveMatch(matches[activeIndex], 'find-prev');
    count.textContent = `${activeIndex + 1}/${matches.length}`;
    log('SUCCESS', 'Find prev executed');
  };

  const handleReplaceNext = (): void => {
    if (!state.query) {
      setStatus(labels.status.enterSearchTerm, 'INFO');
      log('WARNING', 'Replace next ignored: empty query');
      return;
    }
    applySearchState('replace-next', { resetActive: false, shouldScroll: false });
    const startedAt = performance.now();
    const matches = getMatches();
    if (matches.length === 0) {
      setStatus(labels.status.noMatchesToReplace, 'WARNING');
      log('WARNING', 'Replace next failed: no matches');
      return;
    }
    if (activeIndex < 0 || activeIndex >= matches.length) {
      activeIndex = 0;
    }
    const ok = replaceMatchAt(matches[activeIndex]);
    if (!ok) {
      setStatus(labels.status.noMatchesToReplace, 'WARNING');
      log('WARNING', 'Replace next failed', { preserveCase: state.preserveCase, regex: state.regex });
      return;
    }
    log('SUCCESS', 'Replace next applied', { durationMs: Math.round(performance.now() - startedAt) });
  };

  const handleReplaceAll = (): void => {
    if (!state.query) {
      setStatus(labels.status.enterSearchTerm, 'INFO');
      log('WARNING', 'Replace all ignored: empty query');
      return;
    }
    applySearchState('replace-all', { resetActive: false, shouldScroll: false });
    const startedAt = performance.now();
    const matches = getMatches();
    const ok = replaceMatches(matches);
    if (!ok) {
      setStatus(labels.status.noMatchesToReplace, 'WARNING');
      log('WARNING', 'Replace all failed', { preserveCase: state.preserveCase, regex: state.regex });
      return;
    }
    log('SUCCESS', 'Replace all applied', { durationMs: Math.round(performance.now() - startedAt) });
  };

  const toggleMatchCase = (): void => {
    state = { ...state, matchCase: !state.matchCase };
    updateToggleUI();
    syncState('match-case');
    applySearchState('match-case');
  };

  const toggleWholeWord = (): void => {
    state = { ...state, wholeWord: !state.wholeWord };
    updateToggleUI();
    syncState('whole-word');
    applySearchState('whole-word');
  };

  const toggleRegex = (): void => {
    state = { ...state, regex: !state.regex };
    if (state.regex && state.preserveCase) {
      state = { ...state, preserveCase: false };
      setStatus(labels.status.preserveCaseDisabled, 'WARNING');
      log('WARNING', 'Preserve case disabled: regex enabled');
    }
    updateToggleUI();
    syncState('regex');
    applySearchState('regex');
  };

  const toggleFindInSelection = (): void => {
    if (!state.inSelection) {
      const ok = ensureSelectionRange();
      if (!ok) {
        syncState('selection-failed');
        return;
      }
      state = { ...state, inSelection: true };
    } else {
      state = { ...state, inSelection: false };
      selectionRange = null;
    }
    updateToggleUI();
    syncState('selection');
    applySearchState('selection');
  };

  const togglePreserveCase = (): void => {
    if (state.regex) {
      setStatus(labels.status.preserveCaseDisabled, 'WARNING');
      log('WARNING', 'Preserve case toggle ignored: regex enabled');
      return;
    }
    state = { ...state, preserveCase: !state.preserveCase };
    updateToggleUI();
    syncState('preserve-case');
  };

  const onFindKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      if (event.ctrlKey || event.metaKey) {
        const start = findInput.selectionStart ?? 0;
        const end = findInput.selectionEnd ?? start;
        const value = findInput.value;
        findInput.value = `${value.slice(0, start)}\n${value.slice(end)}`;
        findInput.selectionStart = findInput.selectionEnd = start + 1;
        updateFromInput();
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        handleFindPrev();
      } else {
        handleFindNext();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
  };

  const onReplaceKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleReplaceNext();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onTransaction = ({ transaction }: { transaction: Transaction }): void => {
    if (!state.visible) {
      return;
    }
    updateToggleUI();
    if (!transaction.docChanged) {
      return;
    }
    const query = buildQuery();
    syncMatches(query.valid, 'transaction', false, { shouldScroll: false });
  };

  findInput.addEventListener('input', updateFromInput);
  findInput.addEventListener('keydown', onFindKeydown);
  replaceInput.addEventListener('input', updateReplacement);
  replaceInput.addEventListener('keydown', onReplaceKeydown);

  matchCaseBtn.addEventListener('click', toggleMatchCase);
  wholeWordBtn.addEventListener('click', toggleWholeWord);
  regexBtn.addEventListener('click', toggleRegex);
  selectionBtn.addEventListener('click', toggleFindInSelection);
  preserveCaseBtn.addEventListener('click', togglePreserveCase);

  prevBtn.addEventListener('click', handleFindPrev);
  nextBtn.addEventListener('click', handleFindNext);
  closeBtn.addEventListener('click', close);
  replaceBtn.addEventListener('click', handleReplaceNext);
  replaceAllBtn.addEventListener('click', handleReplaceAll);
  toggleReplaceButton.addEventListener('click', () => setReplaceVisible(!state.replaceVisible));
  widget.addEventListener('pointerdown', onPointerDown);

  editor.on('transaction', onTransaction);

  const restoreState = (saved?: FindWidgetState): void => {
    if (!saved) {
      return;
    }
    state = {
      ...state,
      query: saved.query ?? state.query,
      replace: saved.replace ?? state.replace,
      matchCase: saved.matchCase ?? state.matchCase,
      wholeWord: saved.wholeWord ?? state.wholeWord,
      regex: saved.regex ?? state.regex,
      preserveCase: saved.preserveCase ?? state.preserveCase,
      inSelection: false,
      replaceVisible: saved.replaceVisible ?? state.replaceVisible,
      visible: saved.visible ?? state.visible,
      width: saved.width ?? state.width,
    };
    findInput.value = state.query;
    replaceInput.value = state.replace;
    updateToggleUI();
    if (state.visible) {
      setVisibility(true);
      setReplaceVisible(state.replaceVisible);
      applySearchState('restore');
    }
    if (state.width) {
      widget.style.width = `${state.width}px`;
    } else {
      widget.style.width = '';
    }
    widget.style.height = '';
  };

  const getState = (): FindWidgetState => ({ ...state });

  updateToggleUI();
  setReplaceVisible(false);
  setStatus('', 'INFO');

  return {
    openFind: (opts) => openFind({ seedFromSelection: opts?.seedFromSelection ?? true, showReplace: false }),
    openReplace: (opts) => openFind({ seedFromSelection: opts?.seedFromSelection ?? true, showReplace: true }),
    close,
    findNext: handleFindNext,
    findPrev: handleFindPrev,
    replaceNext: handleReplaceNext,
    replaceAll: handleReplaceAll,
    toggleMatchCase,
    toggleWholeWord,
    toggleRegex,
    toggleFindInSelection,
    togglePreserveCase,
    isVisible: () => state.visible,
    destroy: () => {
      findInput.removeEventListener('input', updateFromInput);
      findInput.removeEventListener('keydown', onFindKeydown);
      replaceInput.removeEventListener('input', updateReplacement);
      replaceInput.removeEventListener('keydown', onReplaceKeydown);
      editor.off('transaction', onTransaction);
      widget.removeEventListener('pointerdown', onPointerDown);
      widget.remove();
    },
    getState,
    restoreState,
  };
};
