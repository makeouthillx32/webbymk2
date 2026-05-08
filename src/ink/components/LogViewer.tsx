// src/ink/components/LogViewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scrollable log / output viewer for the OperationOverlay.
//
// Replaces the raw lines.slice(-30) dump with a proper viewport that:
//   • Auto-scrolls to the bottom while the operation is running (pinned mode)
//   • Lets the user scroll back through the full history
//   • Re-pins on [G] or when the stream stops
//
// Keyboard (active while overlay is visible):
//   ↑ / k          scroll up 1 line
//   ↓ / j          scroll down 1 line
//   u / PgUp       scroll up half a page
//   d / PgDn       scroll down half a page
//   g              jump to top
//   G              jump to bottom (re-pin auto-scroll)
//
// The OperationOverlay owns q / Esc / c — those are NOT handled here.
//
// height prop = number of terminal rows available for content (caller computes
// terminal_height - chrome_rows so we never need to know our own position).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text, useInput }        from "ink";
import { LoadingState }               from "./design-system/LoadingState.tsx";
import type { OpView }                from "../OperationOverlay.tsx";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Output mode: dim lines older than the last N so newest output pops. */
const DIM_CUTOFF = 8;

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

  // scrollOffset: how many lines above the bottom the viewport is anchored.
  //   0 = pinned to bottom → auto-scroll as new lines arrive
  //   N = scrolled back N lines from the bottom
  const [scrollOffset, setScrollOffset] = useState(0);

  const total   = lines.length;
  const pinned  = scrollOffset === 0;
  // One row is always reserved for the cursor / live-paused banner.
  const viewRows = Math.max(1, height - 1);
  const maxOff   = Math.max(0, total - viewRows);

  // Re-clamp offset whenever the line buffer grows (prevents over-scroll
  // after the buffer reaches its cap and old lines are evicted).
  useEffect(() => {
    setScrollOffset((s) => Math.min(s, Math.max(0, total - viewRows)));
  }, [total, viewRows]);

  const clamp = (n: number) => Math.max(0, Math.min(Math.max(0, total - viewRows), n));

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (key.upArrow   || input === "k") { setScrollOffset((s) => clamp(s + 1));                       return; }
    if (key.downArrow || input === "j") { setScrollOffset((s) => clamp(s - 1));                       return; }
    if (input === "u" || key.pageUp)    { setScrollOffset((s) => clamp(s + Math.floor(viewRows / 2))); return; }
    if (input === "d" || key.pageDown)  { setScrollOffset((s) => clamp(s - Math.floor(viewRows / 2))); return; }
    if (input === "g")                  { setScrollOffset(clamp(maxOff));                               return; }
    if (input === "G")                  { setScrollOffset(0);                                           return; }
  });

  // ── Compute visible slice ──────────────────────────────────────────────────
  const lineEnd   = total - scrollOffset;
  const lineStart = Math.max(0, lineEnd - viewRows);
  const visible   = lines.slice(lineStart, lineEnd);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" height={height} overflow="hidden">

      {/* Scroll-back banner — replaces the cursor row when not pinned */}
      {!pinned && (
        <Box justifyContent="space-between" paddingX={1}>
          <Text dimColor>
            {"↑"} {scrollOffset} line{scrollOffset !== 1 ? "s" : ""} above
          </Text>
          <Text dimColor>
            {busy ? "live feed paused · " : ""}[G] bottom
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
          // Output mode: dim older lines so the newest output catches the eye.
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

      {/* Live cursor — only shown when pinned at the bottom */}
      {busy && pinned && <Text color="yellow">▌</Text>}

    </Box>
  );
}
