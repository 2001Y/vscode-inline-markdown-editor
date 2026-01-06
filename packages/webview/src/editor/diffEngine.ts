/**
 * Role: Diff engine for computing minimal text changes
 * Responsibility: Compare shadowText and nextMarkdown to generate Replace[] for G5-lite
 * Invariant: Generated Replace[] must be non-overlapping and in ascending order
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
  if (changes.length === 0) return [];

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
  if (changes.length === 0) return text;

  const sorted = [...changes].sort((a, b) => b.start - a.start);

  let result = text;
  for (const change of sorted) {
    result = result.slice(0, change.start) + change.text + result.slice(change.end);
  }

  return result;
}
