// src/ink/components/SearchBox.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Two exports:
//
//   SearchBox    — controlled display component (unchanged). Used by FuzzyPicker
//                  which manages state externally via useSearchInput.
//
//   SearchInput  — self-contained stateful input. Replaces TextInput.tsx.
//                  Supports both controlled (value + onChange) and uncontrolled
//                  (onSubmit + reset) modes. Full cursor-aware keyboard handling.
//
// SearchInput keyboard:
//   printable chars    → insert at cursor
//   ← / →             → move cursor
//   Ctrl-A / Home      → cursor to start
//   Ctrl-E / End       → cursor to end
//   Backspace          → delete before cursor
//   Delete             → delete at cursor
//   Enter              → onSubmit(trimmed) then reset (uncontrolled),
//                        or just onSubmit (controlled)
//   Esc / Ctrl-C       → onCancel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { Box, Text }                  from '../../ink.js';
import { useInput }                   from '../runtimeInk.js';

type Props = {
  query: string;
  placeholder?: string;
  isFocused: boolean;
  isTerminalFocused: boolean;
  prefix?: string;
  width?: number | string;
  cursorOffset?: number;
  borderless?: boolean;
};

// \u2500\u2500 SearchBox \u2014 controlled display (unchanged) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export function SearchBox({
  query,
  placeholder = 'Search\u2026',
  isFocused,
  isTerminalFocused,
  prefix = '\u2315',
  width,
  cursorOffset,
  borderless = false,
}: Props): React.ReactNode {
  const offset = cursorOffset ?? query.length;

  return (
    <Box
      flexShrink={0}
      borderStyle={borderless ? undefined : 'round'}
      borderColor={isFocused ? 'suggestion' : undefined}
      borderDimColor={!isFocused}
      paddingX={borderless ? 0 : 1}
      width={width}
    >
      <Text dimColor={!isFocused}>
        {prefix}{' '}
        {isFocused ? (
          <>
            {query ? (
              isTerminalFocused ? (
                <>
                  <Text>{query.slice(0, offset)}</Text>
                  <Text inverse>
                    {offset < query.length ? query[offset] : ' '}
                  </Text>
                  {offset < query.length && (
                    <Text>{query.slice(offset + 1)}</Text>
                  )}
                </>
              ) : (
                <Text>{query}</Text>
              )
            ) : isTerminalFocused ? (
              <>
                <Text inverse>{placeholder.charAt(0)}</Text>
                <Text dimColor>{placeholder.slice(1)}</Text>
              </>
            ) : (
              <Text dimColor>{placeholder}</Text>
            )}
          </>
        ) : query ? (
          <Text>{query}</Text>
        ) : (
          <Text>{placeholder}</Text>
        )}
      </Text>
    </Box>
  );
}

// ── SearchInput — self-contained stateful input ───────────────────────────────
//
// Dual-mode:
//   Controlled   → pass value + onChange.  Parent owns the string;
//                  SearchInput manages cursor only.
//   Uncontrolled → omit value.  SearchInput owns the string internally;
//                  onSubmit(trimmed) fires on Enter and the field resets.
//
// Both modes support onSubmit and onCancel.
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchInputProps {
  /** Controlled mode: current value (parent owns state). */
  value?:       string;
  /** Fires on every keystroke with the new full value. */
  onChange?:    (v: string) => void;
  /** Fires on Enter with the trimmed value. In uncontrolled mode the field
   *  also resets to "". */
  onSubmit?:    (v: string) => void;
  /** Fires on Esc or Ctrl-C. */
  onCancel?:    () => void;
  /**
   * Return false to reject a character before insertion.
   * e.g. (ch) => /^[a-z0-9-]$/.test(ch) for slug fields.
   */
  validate?:    (ch: string) => boolean;
  placeholder?: string;
  /**
   * Optional prefix shown inside the box before the text.
   * Default: "" (no prefix). Pass "⌕" for a search-style input.
   */
  prefix?:      string;
  /** Box width in columns. */
  width?:       number | string;
  /** Removes the border — useful when embedding inside another styled box. */
  borderless?:  boolean;
  /**
   * Enables keyboard handling.  Set false to visually freeze the field
   * while another component owns the input (controlled-focus pattern).
   * Default: true.
   */
  active?:      boolean;
}

export function SearchInput({
  value:        controlledValue,
  onChange,
  onSubmit,
  onCancel,
  validate,
  placeholder = "",
  prefix      = "",
  width,
  borderless  = false,
  active      = true,
}: SearchInputProps): React.ReactNode {

  const isControlled = controlledValue !== undefined;

  // Uncontrolled draft — ignored when controlled
  const [draft,  setDraft]  = useState(isControlled ? "" : "");
  const [cursor, setCursor] = useState(0);

  // Sync cursor end-position when controlled value changes externally
  // (e.g. parent resets the field after submission)
  useEffect(() => {
    if (isControlled) {
      // Don't slam the cursor to the end on every keystroke — only when
      // the parent replaces the value wholesale (e.g. resets to "").
      setCursor((c) => Math.min(c, (controlledValue ?? "").length));
    }
  }, [isControlled, controlledValue]);

  const value = isControlled ? (controlledValue ?? "") : draft;

  // ── Mutate helper: update value + cursor atomically ───────────────────────
  function mutate(newVal: string, newCursor: number): void {
    if (!isControlled) setDraft(newVal);
    setCursor(newCursor);
    onChange?.(newVal);
  }

  // ── Keyboard handling ─────────────────────────────────────────────────────
  useInput((input, key) => {
    if (!active) return;

    // Submit
    if (key.return) {
      const trimmed = value.trim();
      onSubmit?.(trimmed);
      if (!isControlled) {
        setDraft("");
        setCursor(0);
        onChange?.("");
      }
      return;
    }

    // Cancel
    if (key.escape || (key.ctrl && input === "c")) {
      onCancel?.();
      return;
    }

    // Cursor movement
    if (key.leftArrow)  { setCursor((c) => Math.max(0, c - 1));            return; }
    if (key.rightArrow) { setCursor((c) => Math.min(value.length, c + 1)); return; }
    if (key.ctrl && input === "a") { setCursor(0);            return; }   // readline start
    if (key.ctrl && input === "e") { setCursor(value.length); return; }   // readline end

    // Deletion
    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      mutate(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
      return;
    }

    // Insertion — ignore control/meta combos and special key names.
    // Multi-char input (input.length > 1) is a bracketed paste arriving
    // atomically; insert it all at once rather than dropping it.
    if (!input || key.ctrl || key.meta) return;
    // Reject key names emitted as multi-char strings (e.g. "return", "escape")
    // by checking whether every codepoint is non-printable.
    if (input.length > 1 && [...input].every(c => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return;
    if (validate) {
      for (const ch of input) { if (!validate(ch)) return; }
    }

    mutate(value.slice(0, cursor) + input + value.slice(cursor), cursor + input.length);

  });

  // ── Render ────────────────────────────────────────────────────────────────
  const before   = value.slice(0, cursor);
  const atCursor = value[cursor] ?? " ";   // char under cursor, or space at EOL
  const after    = value.slice(cursor + 1);
  const isEmpty  = value.length === 0;

  const prefixNode = prefix
    ? <Text dimColor={!active}>{prefix} </Text>
    : null;

  return (
    <Box
      flexShrink={0}
      borderStyle={borderless ? undefined : "round"}
      borderColor={active ? "cyan" : "gray"}
      borderDimColor={!active}
      paddingX={borderless ? 0 : 1}
      width={width}
    >
      <Text>
        {prefixNode}
        {active ? (
          // Show block cursor at current position
          <>
            {before && <Text>{before}</Text>}
            <Text inverse>{atCursor}</Text>
            {after  && <Text>{after}</Text>}
          </>
        ) : isEmpty && placeholder ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <Text dimColor={!active}>{value}</Text>
        )}
        {/* Placeholder behind cursor when field is empty + active */}
        {active && isEmpty && placeholder && (
          <Text dimColor>{placeholder.slice(1)}</Text>
        )}
      </Text>
    </Box>
  );
}
