"use client";
// hooks/useAtomicBlockEditing.ts
// Makes post://-image refs and [[wiki]] links behave like single embedded
// units inside a plain <textarea> — one Backspace/Delete removes the whole
// block (and its blank line, if it owned one), and a selection that merely
// touches a block grows to cover it before Backspace/Delete/Cut/typed
// replacement.
//
// Pairs with useTextInsertion: that hook writes text in, this one guards
// what Backspace/Delete/Cut/typing can take back out. Both are pure
// range-math over the controlled `value` string — no editor library.
//
// 2026-07-29: this used to also snap a caret that merely CLICKED anywhere
// inside a block out to its nearest edge (onSelect). Pulled it — on any
// image whose alt text made the block wrap across visual lines, "inside"
// meant the whole wrapped span, so clicking to position the caret at what
// looked like the end of one visual row could silently teleport it to the
// block's start, a line or more above, and the next keystroke landed there
// instead. Deletion/selection protection doesn't have this problem (it only
// acts on an explicit Backspace/Delete/Cut, never on a plain click), so it
// stays; the click-time snapping was a bigger cost than the polish it added.

import { type ClipboardEvent, type KeyboardEvent, useCallback, useRef } from "react";
import {
  expandAtomicBlockDeletion,
  expandSelectionAcrossAtomicBlocks,
  findAtomicBlocks,
} from "@/lib/editor/atomicBlocks";

export interface AtomicBlockEditingApi {
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCut: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function useAtomicBlockEditing(
  value: string,
  onChange: (next: string) => void,
): AtomicBlockEditingApi {
  const valueRef = useRef(value);
  valueRef.current = value;

  const setCollapsedCaret = useCallback((node: HTMLTextAreaElement, position: number) => {
    node.setSelectionRange(position, position);
  }, []);

  const applyDeletion = useCallback(
    (node: HTMLTextAreaElement, start: number, end: number) => {
      const source = valueRef.current ?? "";
      onChange(source.slice(0, start) + source.slice(end));
      requestAnimationFrame(() => {
        node.focus();
        setCollapsedCaret(node, start);
      });
    },
    [onChange, setCollapsedCaret],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return; // don't fight IME composition
      const node = event.currentTarget;
      const { selectionStart: start, selectionEnd: end } = node;
      const source = valueRef.current ?? "";
      const blocks = findAtomicBlocks(source);
      if (blocks.length === 0) return;

      if (event.key === "Backspace" || event.key === "Delete") {
        if (start !== end) {
          const expanded = expandSelectionAcrossAtomicBlocks(start, end, blocks);
          if (expanded.start === start && expanded.end === end) return; // no block touched
          event.preventDefault();
          applyDeletion(node, expanded.start, expanded.end);
          return;
        }

        const target =
          event.key === "Backspace"
            ? blocks.find((block) => block.end === start)
            : blocks.find((block) => block.start === start);
        if (!target) return;

        event.preventDefault();
        const range = expandAtomicBlockDeletion(source, target);
        applyDeletion(node, range.start, range.end);
        return;
      }

      // A single printable keystroke replacing a selection that touches a
      // block: expand first, so `!\[imag\]\(post://image-\)` can't happen.
      if (start !== end && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const expanded = expandSelectionAcrossAtomicBlocks(start, end, blocks);
        if (expanded.start === start && expanded.end === end) return;
        event.preventDefault();
        const next = source.slice(0, expanded.start) + event.key + source.slice(expanded.end);
        onChange(next);
        const caret = expanded.start + event.key.length;
        requestAnimationFrame(() => {
          node.focus();
          setCollapsedCaret(node, caret);
        });
      }
    },
    [applyDeletion, onChange, setCollapsedCaret],
  );

  const onCut = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const node = event.currentTarget;
      const { selectionStart: start, selectionEnd: end } = node;
      if (start === end) return;
      const source = valueRef.current ?? "";
      const blocks = findAtomicBlocks(source);
      const expanded = expandSelectionAcrossAtomicBlocks(start, end, blocks);
      if (expanded.start === start && expanded.end === end) return; // default cut already correct
      event.preventDefault();
      event.clipboardData.setData("text/plain", source.slice(expanded.start, expanded.end));
      applyDeletion(node, expanded.start, expanded.end);
    },
    [applyDeletion],
  );

  return { onKeyDown, onCut };
}
