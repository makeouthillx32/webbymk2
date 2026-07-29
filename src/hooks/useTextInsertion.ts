"use client";
// hooks/useTextInsertion.ts
// Cursor-aware editing for a plain <textarea>. Gives any markdown/code editor
// insert-at-cursor, wrap-selection and replace-text without pulling in an
// editor library.

import { type RefObject, useCallback, useRef } from "react";

export interface TextInsertionApi {
  // Nullable element type — React 19's useRef(null) yields RefObject<T | null>.
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Insert at the caret (or append when the textarea isn't focused). */
  insert: (snippet: string) => void;
  /** Wrap the current selection, e.g. wrap("**", "**") for bold. */
  wrap: (before: string, after?: string) => void;
  /** Replace the first occurrence of `search` — used to swap placeholders. */
  replace: (search: string, replacement: string) => void;
  focus: () => void;
}

export function useTextInsertion(
  value: string,
  onChange: (next: string) => void,
): TextInsertionApi {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const applyAndRestore = useCallback(
    (next: string, caret: number) => {
      onChange(next);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(caret, caret);
      });
    },
    [onChange],
  );

  const insert = useCallback(
    (snippet: string) => {
      const source = valueRef.current ?? "";
      const node = textareaRef.current;
      const start = node ? node.selectionStart : source.length;
      const end = node ? node.selectionEnd : source.length;
      applyAndRestore(
        `${source.slice(0, start)}${snippet}${source.slice(end)}`,
        start + snippet.length,
      );
    },
    [applyAndRestore],
  );

  const wrap = useCallback(
    (before: string, after = before) => {
      const source = valueRef.current ?? "";
      const node = textareaRef.current;
      if (!node) return insert(`${before}${after}`);
      const { selectionStart: start, selectionEnd: end } = node;
      const selected = source.slice(start, end);
      applyAndRestore(
        `${source.slice(0, start)}${before}${selected}${after}${source.slice(end)}`,
        end + before.length + after.length,
      );
    },
    [applyAndRestore, insert],
  );

  const replace = useCallback(
    (search: string, replacement: string) => {
      const source = valueRef.current ?? "";
      const index = source.indexOf(search);
      if (index === -1) return;
      applyAndRestore(
        `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`,
        index + replacement.length,
      );
    },
    [applyAndRestore],
  );

  const focus = useCallback(() => textareaRef.current?.focus(), []);

  return { textareaRef, insert, wrap, replace, focus };
}
