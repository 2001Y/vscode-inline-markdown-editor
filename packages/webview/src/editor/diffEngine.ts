/**
 * 役割: 最小テキスト変更を計算する差分エンジン
 * 責務: shadowText と nextMarkdown を比較して G5-lite 用の Replace[] を生成
 * 不変条件: 生成された Replace[] は非重複かつ昇順であること
 * 
 * 設計書参照: 12.3.5 (G5-lite 差分計算)
 * 
 * G5-lite 方針:
 * - diff-match-patch ライブラリを使用
 * - diff_cleanupSemantic で人間が読みやすい差分に整理
 * - 最小限の変更で元の書式を保持
 * 
 * Replace[] の例:
 * shadowText: "Hello World"
 * nextMarkdown: "Hello Devin"
 * 結果: [{ start: 6, end: 11, text: "Devin" }]
 * 
 * ChangeMetrics (設計書 11):
 * - changedChars: 変更された文字数
 * - changedRatio: 変更率 (changedChars / originalLength)
 * - hunkCount: 変更箇所の数
 * 
 * ChangeGuard (設計書 11):
 * - maxChangedRatio: 最大変更率 (default: 0.5)
 * - maxChangedChars: 最大変更文字数 (default: 10000)
 * - maxHunks: 最大変更箇所数 (default: 100)
 * - 超過時は警告を表示して編集をブロック
 */

import DiffMatchPatch from 'diff-match-patch';
import type { Replace } from '../protocol/types.js';

const dmp = new DiffMatchPatch();

export interface DiffResult {
  changes: Replace[];
  metrics: ChangeMetrics;
}

export interface ChangeMetrics {
  changedChars: number;
  changedRatio: number;
  hunkCount: number;
}

export function computeDiff(shadowText: string, nextMarkdown: string): DiffResult {
  if (shadowText === nextMarkdown) {
    return {
      changes: [],
      metrics: {
        changedChars: 0,
        changedRatio: 0,
        hunkCount: 0,
      },
    };
  }

  const diffs = dmp.diff_main(shadowText, nextMarkdown);
  dmp.diff_cleanupSemantic(diffs);

  const changes: Replace[] = [];
  let offset = 0;

  for (const [op, text] of diffs) {
    switch (op) {
      case DiffMatchPatch.DIFF_EQUAL:
        offset += text.length;
        break;

      case DiffMatchPatch.DIFF_DELETE: {
        const lastChange = changes[changes.length - 1];
        if (lastChange && lastChange.end === offset && lastChange.text === '') {
          lastChange.end = offset + text.length;
        } else {
          changes.push({
            start: offset,
            end: offset + text.length,
            text: '',
          });
        }
        offset += text.length;
        break;
      }

      case DiffMatchPatch.DIFF_INSERT: {
        const lastChange = changes[changes.length - 1];
        if (lastChange && lastChange.end === offset) {
          lastChange.text += text;
        } else {
          changes.push({
            start: offset,
            end: offset,
            text: text,
          });
        }
        break;
      }
    }
  }

  const normalizedChanges = normalizeChanges(changes);

  const metrics = calculateMetrics(normalizedChanges, shadowText.length);

  return {
    changes: normalizedChanges,
    metrics,
  };
}

function normalizeChanges(changes: Replace[]): Replace[] {
  if (changes.length === 0) {return [];}

  const sorted = [...changes].sort((a, b) => a.start - b.start);

  const merged: Replace[] = [];
  for (const change of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.end >= change.start) {
      last.end = Math.max(last.end, change.end);
      last.text += change.text;
    } else {
      merged.push({ ...change });
    }
  }

  return merged;
}

function calculateMetrics(changes: Replace[], originalLength: number): ChangeMetrics {
  let changedChars = 0;

  for (const change of changes) {
    const deleted = change.end - change.start;
    const inserted = change.text.length;
    changedChars += Math.max(deleted, inserted);
  }

  const changedRatio = originalLength > 0 ? changedChars / originalLength : (changes.length > 0 ? 1 : 0);

  return {
    changedChars,
    changedRatio,
    hunkCount: changes.length,
  };
}

export function isChangeGuardExceeded(
  metrics: ChangeMetrics,
  config: {
    maxChangedRatio: number;
    maxChangedChars: number;
    maxHunks: number;
  }
): boolean {
  return (
    metrics.changedRatio > config.maxChangedRatio ||
    metrics.changedChars > config.maxChangedChars ||
    metrics.hunkCount > config.maxHunks
  );
}

export function applyChangesToText(text: string, changes: Replace[]): string {
  if (changes.length === 0) {return text;}

  const sorted = [...changes].sort((a, b) => b.start - a.start);

  let result = text;
  for (const change of sorted) {
    result = result.slice(0, change.start) + change.text + result.slice(change.end);
  }

  return result;
}
