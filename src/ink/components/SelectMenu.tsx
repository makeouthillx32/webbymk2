// src/ink/components/SelectMenu.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Reusable searchable single-select list for Ink.
// Replaces the broken FuzzyPicker.tsx (which depended on engine internals
// that don't exist in this project).
//
// Features:
//   • Optional live-filter search field at the top
//   • j/k + arrow key navigation
//   • Enter to confirm the highlighted item
//   • Esc or q to cancel
//
// Self-contained: owns cursor + query state, calls onSelect(option) on confirm.
//
// Usage:
//   <SelectMenu
//     options={LAYOUT_OPTIONS.map(o => ({ id: o.type, label: o.label, desc: o.desc }))}
//     onSelect={(opt) => handleLayoutChosen(opt.id)}
//     onCancel={() => setStep("label")}
//   />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Box, Text, useInput }                        from "ink";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectOption {
  /** Unique key for the item. */
  id:    string;
  /** Primary display label. */
  label: string;
  /** Optional secondary description shown dimmed after the label. */
  desc?: string;
}

interface SelectMenuProps {
  options:      SelectOption[];
  /** Called when the user confirms a highlighted item. */
  onSelect:     (option: SelectOption) => void;
  /** Called when the user presses Esc or q. */
  onCancel?:    () => void;
  /**
   * Fired whenever the highlighted option changes (cursor moves or filter
   * changes).  Lets parent components track the focused item without
   * needing to own the cursor state themselves.
   */
  onHighlight?: (option: SelectOption) => void;
  /** Set false to suppress key handling. Default: true. */
  active?:      boolean;
  /**
   * Show a filter field above the list.
   * Useful for long lists; keep false for short ones (≤ 5 items).
   * Default: false.
   */
  searchable?:  boolean;
  /** Index of the pre-highlighted item on mount. Default: 0. */
  initialIndex?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SelectMenu({
  options,
  onSelect,
  onCancel,
  onHighlight,
  active       = true,
  searchable   = false,
  initialIndex = 0,
}: SelectMenuProps) {

  const [query,  setQuery]  = useState("");
  const [cursor, setCursor] = useState(initialIndex);

  // Filter options by query (label + desc, case-insensitive).
  const filtered = useMemo(() => {
    if (!searchable || !query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.desc?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query, searchable]);

  // Clamp cursor into filtered range.
  const safeIdx = Math.min(cursor, Math.max(0, filtered.length - 1));

  // Notify parent whenever the highlighted item changes (cursor move or filter
  // change).  Use a ref to avoid firing on the very first render with the same
  // id — parent can init its own state from the first onHighlight call.
  const lastHighlightedId = useRef<string | null>(null);
  useEffect(() => {
    const opt = filtered[safeIdx];
    if (!opt) return;
    if (opt.id === lastHighlightedId.current) return;
    lastHighlightedId.current = opt.id;
    onHighlight?.(opt);
  }, [safeIdx, filtered, onHighlight]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (!active) return;

    // Cancel
    if (key.escape || input === "q") { onCancel?.(); return; }

    // Navigation
    if (key.upArrow   || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
      return;
    }

    // Confirm
    if (key.return) {
      const chosen = filtered[safeIdx];
      if (chosen) onSelect(chosen);
      return;
    }

    // Search input (when searchable mode is on)
    if (searchable) {
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        setCursor(0);
        return;
      }
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setQuery((q) => q + input);
        setCursor(0);
        return;
      }
    }
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      {/* Search bar — only in searchable mode */}
      {searchable && (
        <Box gap={1} marginBottom={1}>
          <Text dimColor>filter</Text>
          <Box borderStyle="single" borderColor={active ? "cyan" : "gray"} paddingX={1} width={28}>
            <Text color="white">
              {query || ""}
              {active && <Text color="cyan">▌</Text>}
            </Text>
          </Box>
        </Box>
      )}

      {/* Item list */}
      {filtered.length === 0 ? (
        <Box paddingX={2}>
          <Text dimColor>No matches for "{query}"</Text>
        </Box>
      ) : (
        filtered.map((opt, i) => {
          const focused = i === safeIdx;
          return (
            <Box key={opt.id} gap={2} paddingX={1}>
              <Text color={focused ? "cyan" : undefined} bold={focused}>
                {focused ? "›" : " "}
              </Text>
              <Box width={14}>
                <Text color={focused ? "cyan" : undefined} bold={focused}>
                  {opt.label}
                </Text>
              </Box>
              {opt.desc && (
                <Text dimColor={!focused} color={focused ? "gray" : undefined}>
                  {opt.desc}
                </Text>
              )}
            </Box>
          );
        })
      )}

      {/* Hint bar */}
      <Box paddingX={2} marginTop={1}>
        <Text dimColor>[↑↓/jk] navigate  [↵] confirm  [esc/q] back</Text>
      </Box>

    </Box>
  );
}
