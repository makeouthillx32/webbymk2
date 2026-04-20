// src/ink/hooks/useTextInput.ts
// ─────────────────────────────────────────────────────────────────────────────
// Minimal single-line text input for Ink — no external dependency.
// Captures printable characters keystroke-by-keystroke.
//
// Usage:
//   const { value, reset } = useTextInput({ active, onSubmit, onCancel });
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { useInput }              from "ink";

interface Options {
  /** Only capture input when true — lets parent control focus */
  active:    boolean;
  onSubmit:  (value: string) => void;
  onCancel?: () => void;
  /** Optional character-level validator — return false to reject the char */
  validate?: (char: string, current: string) => boolean;
}

export function useTextInput({ active, onSubmit, onCancel, validate }: Options) {
  const [value, setValue] = useState("");

  const reset = useCallback(() => setValue(""), []);

  useInput((input, key) => {
    if (!active) return;

    if (key.return) {
      onSubmit(value.trim());
      return;
    }

    if (key.escape) {
      onCancel?.();
      return;
    }

    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }

    // Ignore control/meta combos — only accept printable chars
    if (!input || key.ctrl || key.meta) return;

    if (validate && !validate(input, value)) return;

    setValue((v) => v + input);
  });

  return { value, setValue, reset };
}
