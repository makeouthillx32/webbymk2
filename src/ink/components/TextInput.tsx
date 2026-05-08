// src/ink/components/TextInput.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clean, cursor-aware single-line text input for Ink.
// Manages its own draft state internally — calls onSubmit(val) on Enter.
//
// Keyboard (active only):
//   printable chars    → insert at cursor
//   ←  / →            → move cursor
//   Ctrl-A / Home      → cursor to start
//   Ctrl-E / End       → cursor to end
//   Backspace          → delete char before cursor
//   Delete             → delete char at cursor
//   Enter              → onSubmit(trimmed value), reset field
//   Esc                → onCancel()
//   Ctrl-C             → onCancel()  (hard escape hatch — reliable on all terminals)
//
// Note: [q] is NOT treated as cancel here — it is a regular character so
// users can type zone keys like "quest". Use Esc or Ctrl-C to cancel a text step.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

// ── Props ─────────────────────────────────────────────────────────────────────

interface TextInputProps {
  /** Called with the trimmed value when the user presses Enter. */
  onSubmit:   (value: string) => void;
  /** Called when the user presses Esc. */
  onCancel?:  () => void;
  /**
   * Return false to reject a character before it is inserted.
   * Useful for restricting input to a charset (e.g. /^[a-z0-9-]$/).
   */
  validate?:  (char: string) => boolean;
  /** Set false to suppress all key handling (controlled focus). Default: true. */
  active?:    boolean;
  /** Visible width of the input box in columns. Default: 36. */
  width?:     number;
  /** Shown when the field is empty and not active. */
  placeholder?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TextInput({
  onSubmit,
  onCancel,
  validate,
  active      = true,
  width       = 36,
  placeholder = "",
}: TextInputProps) {
  const [value,  setValue]  = useState("");
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (!active) return;

    // ── Submit / Cancel ──────────────────────────────────────────────────────
    if (key.return) {
      const trimmed = value.trim();
      onSubmit(trimmed);
      setValue("");
      setCursor(0);
      return;
    }
    if (key.escape) {
      onCancel?.();
      return;
    }
    // Ctrl-C — reliable hard exit on terminals where Esc is swallowed (e.g. Windows)
    if (key.ctrl && input === "c") {
      onCancel?.();
      return;
    }

    // ── Cursor movement ──────────────────────────────────────────────────────
    if (key.leftArrow)  { setCursor((c) => Math.max(0, c - 1));             return; }
    if (key.rightArrow) { setCursor((c) => Math.min(value.length, c + 1)); return; }

    // Ctrl-A → start,  Ctrl-E → end  (readline-style)
    if (key.ctrl && input === "a") { setCursor(0);             return; }
    if (key.ctrl && input === "e") { setCursor(value.length);  return; }

    // ── Deletion ─────────────────────────────────────────────────────────────
    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
      setCursor((c) => c - 1);
      return;
    }

    // ── Insertion ─────────────────────────────────────────────────────────────
    // Ignore control / meta combos — only accept printable characters.
    if (!input || key.ctrl || key.meta) return;
    if (validate && !validate(input)) return;

    setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
    setCursor((c) => c + 1);
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  const before = value.slice(0, cursor);
  const after  = value.slice(cursor);

  const isEmpty = value.length === 0;

  return (
    <Box
      borderStyle="single"
      borderColor={active ? "cyan" : "gray"}
      paddingX={1}
      width={width}
    >
      {active ? (
        <Text color="white">
          {before}<Text color="cyan">▌</Text>{after}
        </Text>
      ) : isEmpty && placeholder ? (
        <Text dimColor>{placeholder}</Text>
      ) : (
        <Text color="gray">{value}</Text>
      )}
    </Box>
  );
}
