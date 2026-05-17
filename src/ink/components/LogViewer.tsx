// src/ink/components/LogViewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scrollable log / output viewer for the OperationOverlay.
//
// Keyboard (active while overlay is visible):
//   ↑ / k          scroll up 1 line
//   ↓ / j          scroll down 1 line
//   u / PgUp       scroll up half a page
//   d / PgDn       scroll down half a page
//   g              jump to top
//   G              jump to bottom (re-pin auto-scroll)
//   f              open/close filter panel
//
// Filter panel keys (when panel is open):
//   ↑ / k          move cursor up
//   ↓ / j          move cursor down
//   space / enter  toggle selected filter on/off
//   f / esc        close filter panel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput }               from "ink";
import { LoadingState }                       from "./design-system/LoadingState.tsx";
import type { OpView }                        from "../OperationOverlay.tsx";
import { initWheelAccel, computeWheelStep }  from "../utils/wheelAccel.ts";
import { useSelection }                       from "../hooks/use-selection.ts";
import {
  shouldClearSelectionOnKey,
  selectionFocusMoveForKey,
}                                             from "../utils/selectionKeys.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Output mode: dim lines older than the last N so newest output pops. */
const DIM_CUTOFF = 8;

// ── Log filters ───────────────────────────────────────────────────────────────

const LOG_FILTERS = [
  {
    id:    "track",
    label: "[TRACK] analytics",
    match: (l: string) => l.includes("[TRACK]"),
  },
  {
    id:    "analytics",
    label: "Analytics Client init",
    match: (l: string) => l.includes("Analytics Client initialized"),
  },
  {
    id:    "warn",
    label: "Tailwind warns",
    match: (l: string) => l.startsWith("warn -"),
  },
  {
    id:    "imgqual",
    label: "Image quality warns",
    match: (l: string) =>
      l.includes('is using quality "100"') || l.includes("images.qualities"),
  },
  {
    id:    "staticapi",
    label: "/api/static-pages/ reqs",
    match: (l: string) => l.includes("/api/static-pages/"),
  },
  {
    id:    "security",
    label: "[SECURITY] logs",
    match: (l: string) => l.includes("[SECURITY]"),
  },
] as const;

type FilterId = (typeof LOG_FILTERS)[number]["id"];

/** Filters hidden by default — the noisy ones. */
const DEFAULT_HIDDEN = new Set<FilterId>(["track", "analytics", "warn", "imgqual"]);

function applyFilters(lines: string[], hidden: Set<FilterId>): string[] {
  if (hidden.size === 0) return lines;
  return lines.filter(
    (l) => !LOG_FILTERS.some((f) => hidden.has(f.id) && f.match(l))
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LogViewerProps {
  lines:  string[];
  busy:   boolean;
  mode:   OpView;
  /**
   * Usable content rows — terminal height minus overlay chrome (borders,
   * header bar, divider).  Caller should pass (termHeight - 4).
   */
  height: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LogViewer({ lines, busy, mode, height }: LogViewerProps) {

  // scrollOffset: 0 = pinned to bottom, N = scrolled back N lines.
  const [scrollOffset, setScrollOffset] = useState(0);

  // Filter state.
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [filterCursor, setFilterCursor] = useState(0);
  const [hidden,       setHidden]       = useState<Set<FilterId>>(() => new Set(DEFAULT_HIDDEN));

  // Wheel acceleration.
  const wheelAccel  = useRef(initWheelAccel());
  const termProgram = process.env['TERM_PROGRAM'];

  // Selection API.
  const selection = useSelection();

  // Apply filters to the raw line buffer.
  const filtered  = applyFilters(lines, hidden);
  const rawTotal  = lines.length;
  const total     = filtered.length;
  const pinned    = scrollOffset === 0;
  const viewRows  = Math.max(1, height - 1);
  const maxOff    = Math.max(0, total - viewRows);

  // Re-clamp on buffer change.
  useEffect(() => {
    setScrollOffset((s) => Math.min(s, Math.max(0, total - viewRows)));
  }, [total, viewRows]);

  const clamp = (n: number) => Math.max(0, Math.min(Math.max(0, total - viewRows), n));

  const toggleFilter = (id: FilterId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Keyboard + wheel ────────────────────────────────────────────────────────
  useInput((input, key) => {

    // ── Filter panel mode ─────────────────────────────────────────────────
    if (filterOpen) {
      if (input === "f" || key.escape) { setFilterOpen(false); return; }
      if (key.upArrow   || input === "k") { setFilterCursor((c) => Math.max(0, c - 1));                        return; }
      if (key.downArrow || input === "j") { setFilterCursor((c) => Math.min(LOG_FILTERS.length - 1, c + 1));   return; }
      if (input === " " || key.return)    { const f = LOG_FILTERS[filterCursor]; if (f) toggleFilter(f.id);    return; }
      return; // swallow other keys while panel open
    }

    // ── Wheel scroll ──────────────────────────────────────────────────────
    if (key.wheelUp || key.wheelDown) {
      const dir = key.wheelUp ? 'up' : 'down';
      const { step, next } = computeWheelStep(wheelAccel.current, dir, termProgram);
      wheelAccel.current = next;
      if (step > 0) {
        setScrollOffset((s) => clamp(key.wheelUp ? s + step : s - step));
      }
      return;
    }

    // ── Shift+arrow — extend text selection ───────────────────────────────
    const focusMove = selectionFocusMoveForKey(key);
    if (focusMove !== null) { selection.moveFocus(focusMove); return; }

    // ── Any non-selection key clears an active selection ──────────────────
    if (selection.hasSelection() && shouldClearSelectionOnKey(key)) {
      selection.clearSelection();
    }

    // ── Filter panel toggle ───────────────────────────────────────────────
    if (input === "f") { setFilterOpen(true); setFilterCursor(0); return; }

    // ── Standard scroll keys ──────────────────────────────────────────────
    if (key.upArrow   || input === "k") { setScrollOffset((s) => clamp(s + 1));                        return; }
    if (key.downArrow || input === "j") { setScrollOffset((s) => clamp(s - 1));                        return; }
    if (input === "u" || key.pageUp)    { setScrollOffset((s) => clamp(s + Math.floor(viewRows / 2))); return; }
    if (input === "d" || key.pageDown)  { setScrollOffset((s) => clamp(s - Math.floor(viewRows / 2))); return; }
    if (input === "g")                  { setScrollOffset(clamp(maxOff));                               return; }
    if (input === "G")                  { setScrollOffset(0);                                           return; }
  });

  // ── Derived display values ────────────────────────────────────────────────
  const lineEnd      = total - scrollOffset;
  const lineStart    = Math.max(0, lineEnd - viewRows);
  const visible      = filtered.slice(lineStart, lineEnd);
  const hiddenCount  = rawTotal - total;
  const activeCount  = hidden.size;

  // ── Filter panel view ─────────────────────────────────────────────────────
  if (filterOpen) {
    return (
      <Box flexDirection="column" height={height} overflow="hidden">

        <Box justifyContent="space-between" paddingX={1}>
          <Text bold color="cyan">Log Filters</Text>
          <Text dimColor>[space] toggle  ·  [f/esc] close</Text>
        </Box>

        <Box paddingX={1}>
          <Text dimColor>{"─".repeat(44)}</Text>
        </Box>

        {LOG_FILTERS.map((f, i) => {
          const isHidden = hidden.has(f.id);
          const isCursor = i === filterCursor;
          return (
            <Box key={f.id} paddingX={1}>
              <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
                {isCursor ? "▶ " : "  "}
                <Text color={isHidden ? "red" : "green"}>{isHidden ? "✗" : "✓"}</Text>
                {"  "}
                <Text>{f.label}</Text>
                {"  "}
                <Text dimColor>{isHidden ? "hidden" : "visible"}</Text>
              </Text>
            </Box>
          );
        })}

        <Box paddingX={1} marginTop={1}>
          <Text dimColor>
            {hiddenCount} line{hiddenCount !== 1 ? "s" : ""} hidden  ·  {rawTotal} total
          </Text>
        </Box>

      </Box>
    );
  }

  // ── Normal log view ───────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" height={height} overflow="hidden">

      {/* Scroll-back banner */}
      {!pinned && (
        <Box justifyContent="space-between" paddingX={1}>
          <Text dimColor>
            {"↑"} {scrollOffset} line{scrollOffset !== 1 ? "s" : ""} above
            {hiddenCount > 0 ? `  ·  ${hiddenCount} filtered` : ""}
          </Text>
          <Text dimColor>
            {busy ? "live feed paused · " : ""}
            {"[f] filters"}{activeCount > 0 ? ` (${activeCount})` : ""}{"  ·  [G] bottom"}
          </Text>
        </Box>
      )}

      {/* Filter hint when pinned and filters are active */}
      {pinned && hiddenCount > 0 && (
        <Box paddingX={1}>
          <Text dimColor>
            {hiddenCount} line{hiddenCount !== 1 ? "s" : ""} hidden by filters  ·  [f] to manage
          </Text>
        </Box>
      )}

      {/* Content lines */}
      {visible.length === 0 ? (
        <LoadingState message="starting…" dimColor />
      ) : (
        visible.map((line, i) => {
          const absIdx = lineStart + i;
          const isOk   = line.startsWith("✓") || line.startsWith("OK:");
          const isErr  = line.startsWith("✗") || line.startsWith("FAILED") || line.startsWith("⚠");
          const isNew  = mode === "output" && absIdx >= total - DIM_CUTOFF;
          return (
            <Text
              key={absIdx}
              color={isErr ? "red" : isOk ? "green" : undefined}
              dimColor={!isOk && !isErr && mode === "output" && !isNew}
              wrap="truncate"
            >
              {line}
            </Text>
          );
        })
      )}

      {/* Live cursor */}
      {busy && pinned && <Text color="yellow">▌</Text>}

    </Box>
  );
}
