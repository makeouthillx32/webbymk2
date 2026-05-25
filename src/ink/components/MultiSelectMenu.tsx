// src/ink/components/MultiSelectMenu.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Reusable multi-select checkbox list for Ink.
// Modeled after SelectMenu — fully self-contained cursor + selection state.
//
// Keyboard:
//   ↑/k       move cursor up
//   ↓/j       move cursor down
//   [space]   toggle the focused item
//   [↵]       call onConfirm(selectedIds)
//   [esc]     call onCancel()   — go back one step
//   [q]       call onExit()     — exit entirely (falls back to onCancel if absent)
//
// The Esc / q split lets callers distinguish "back one step" from "leave the
// whole flow" — important in multi-step wizards.
//
// initialSelected is copied once on mount.  Pass a new Set reference each time
// the component mounts (i.e. the parent re-renders it into the tree) to reset
// the selection; the Set reference itself is not observed after mount.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "../runtimeInk.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MultiSelectOption {
  /** Unique identifier — returned in the confirmed Set. */
  id:    string;
  /** Primary display label. */
  label: string;
  /** Optional secondary description shown dimmed after the label. */
  desc?: string;
}

interface MultiSelectMenuProps {
  options:          MultiSelectOption[];
  /** Items pre-checked on mount.  Copied once; later prop changes are ignored. */
  initialSelected?: Set<string>;
  /** Called with the current selection when the user presses Enter. */
  onConfirm:        (selected: Set<string>) => void | Promise<void>;
  /** Called when the user presses Esc — typically "go back one step". */
  onCancel?:        () => void;
  /**
   * Called when the user presses q — typically "exit the whole flow".
   * Falls back to onCancel when omitted.
   */
  onExit?:          () => void;
  /** Set false to suppress all key handling. Default: true. */
  active?:          boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MultiSelectMenu({
  options,
  initialSelected,
  onConfirm,
  onCancel,
  onExit,
  active = true,
}: MultiSelectMenuProps) {

  const [cursor,   setCursor]   = useState(0);
  // Copy initialSelected once on mount so internal edits never mutate the
  // caller's Set, and re-mounting always starts from fresh defaults.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected),
  );

  const safeIdx = Math.min(cursor, Math.max(0, options.length - 1));

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (!active) return;

    // esc → back one step;  q → exit entire flow (falls back to onCancel)
    if (key.escape)   { onCancel?.();              return; }
    if (input === "q") { (onExit ?? onCancel)?.(); return; }

    if (key.upArrow   || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(options.length - 1, c + 1));
      return;
    }

    if (input === " ") {
      const opt = options[safeIdx];
      if (!opt) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(opt.id)) next.delete(opt.id); else next.add(opt.id);
        return next;
      });
      return;
    }

    if (key.return) {
      onConfirm(selected);
      return;
    }
  });

  // ── Render ────────────────────────────────────────────────────────────────
  if (options.length === 0) {
    return (
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>No options available for this layout type.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>

      {options.map((opt, i) => {
        const focused = i === safeIdx;
        const checked = selected.has(opt.id);
        return (
          <Box key={opt.id} gap={2} paddingX={1}>
            {/* Cursor */}
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? "›" : " "}
            </Text>
            {/* Checkbox */}
            <Text color={checked ? "green" : "gray"}>
              {checked ? "[x]" : "[ ]"}
            </Text>
            {/* Label */}
            <Box width={14}>
              <Text
                color={focused ? "cyan" : checked ? "green" : undefined}
                bold={focused}
              >
                {opt.label}
              </Text>
            </Box>
            {/* Description */}
            {opt.desc && (
              <Text dimColor={!focused}>{opt.desc}</Text>
            )}
          </Box>
        );
      })}

      {/* Hint bar */}
      <Box paddingX={2} marginTop={1}>
        <Text dimColor>[space] toggle  [↑↓/jk] navigate  [↵] confirm  [esc] back  [q] exit</Text>
      </Box>

    </Box>
  );
}
