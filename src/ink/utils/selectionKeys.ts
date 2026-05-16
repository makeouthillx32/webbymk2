// src/ink/utils/selectionKeys.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers for keyboard-driven text selection. No React, no imports from
// outside this file — fully testable in isolation.
//
// shouldClearSelectionOnKey(key)
//   Returns false for shift+nav keys (which should EXTEND the selection).
//   Returns true for everything else (any keypress that should DROP selection).
//
// selectionFocusMoveForKey(key)
//   Maps shift+arrow/home/end → FocusMove for use-selection's moveFocus().
//   Returns null when the key doesn't correspond to a selection extension.
// ─────────────────────────────────────────────────────────────────────────────

import type { Key } from "../events/input-event.js";
import type { FocusMove } from "../selection.js";

/**
 * Should the current selection be cleared when this key fires?
 *
 * Returns `false` (preserve selection) for:
 *   shift + arrow keys   — extend selection character by character
 *   shift + home / end   — extend to line start / end
 *   meta/super + arrow   — word/document navigation (future)
 *
 * Returns `true` (clear selection) for everything else, including:
 *   unmodified arrow keys, letters, enter, escape, tab, ctrl combos.
 */
export function shouldClearSelectionOnKey(key: Key): boolean {
  // shift+arrow or shift+home/end = selection extension → keep
  if (key.shift && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
    return false;
  }
  if (key.shift && (key.home || key.end)) {
    return false;
  }
  // meta/super navigation — reserved for future word-select extension
  if ((key.meta || key.super) && (key.leftArrow || key.rightArrow)) {
    return false;
  }
  return true;
}

/**
 * Map a key event to a selection FocusMove direction.
 *
 * Returns the appropriate FocusMove when the key should extend an existing
 * selection (shift+nav keys). Returns `null` when the key has no selection
 * move meaning.
 *
 * Shift+left/right move focus one character; shift+up/down move one line.
 * Shift+home maps to lineStart, shift+end maps to lineEnd.
 */
export function selectionFocusMoveForKey(key: Key): FocusMove | null {
  if (!key.shift) return null;

  if (key.upArrow)    return 'up';
  if (key.downArrow)  return 'down';
  if (key.leftArrow)  return 'left';
  if (key.rightArrow) return 'right';
  if (key.home)       return 'lineStart';
  if (key.end)        return 'lineEnd';

  return null;
}
