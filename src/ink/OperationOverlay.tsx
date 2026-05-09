// src/ink/OperationOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen output/log stream overlay shown during build, deploy, restart,
// log-tail, and other long-running operations.
//
// Layout:
//   ╭──────────────────────────────────────────────────────────────────────────╮
//   │  Deploy  Blog                ● running  [↑↓ug] scroll  [esc] detach      │
//   │──────────────────────────────────────────────────────────────────────────│
//   │  Pulling layer 9d4c6b...                                                  │
//   │  Layer 3f6f06: Waiting                                                    │
//   │  ✓ done                                                                   │
//   ╰──────────────────────────────────────────────────────────────────────────╯
//
// Height contract (mirrors AppShell's height={th} overflow="hidden"):
//   The outer Box is pinned to exactly termHeight rows so Ink always repaints
//   the full viewport when switching to/from this overlay.  Without this,
//   shorter frames leave ghost rows from the previous AppShell render.
//
// Chrome rows consumed (excluded from LogViewer's height):
//   1  top border
//   1  header bar
//   1  divider
//   1  bottom border
//   = 4 total  →  LogViewer height = termHeight - 4
//
// mode="output"  — build/deploy: last 8 lines full-bright, older lines dimmed
// mode="logs"    — log tail: all lines equal weight, cursor blink while live
// ─────────────────────────────────────────────────────────────────────────────

import React              from "react";
import { Box, Text }      from "ink";
import { useWidths }      from "./hooks/useTermWidth.ts";
import { useTermHeight }  from "./hooks/useTermWidth.ts";
import { LogViewer }      from "./components/LogViewer.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpView = "output" | "logs";

interface OperationOverlayProps {
  title:    string;
  lines:    string[];
  busy:     boolean;
  mode:     OpView;
  /** True for 1.5 s after a successful [c] copy — triggers inline flash */
  didCopy?: boolean;
}

// ── Chrome constants ──────────────────────────────────────────────────────────

/**
 * Number of terminal rows consumed by the overlay's own chrome:
 *   top border (1) + header bar (1) + divider (1) + bottom border (1)
 * Subtracted from terminal height to get the usable LogViewer height.
 */
const CHROME_ROWS = 4;

// ── Component ─────────────────────────────────────────────────────────────────

export function OperationOverlay({ title, lines, busy, mode, didCopy }: OperationOverlayProps) {
  const { tw, iw } = useWidths();
  const th         = useTermHeight();

  // Rows available for scrollable log content.
  const contentHeight = Math.max(4, th - CHROME_ROWS);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={busy ? "yellow" : "green"}
      paddingX={1}
      width={tw}
      height={th}
      overflow="hidden"
    >
      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <Box justifyContent="space-between">
        <Text bold color={busy ? "yellow" : "green"}>{title}</Text>
        <Box gap={2}>
          {/* Status badge */}
          {busy  && mode === "output" && <Text color="yellow">● running</Text>}
          {busy  && mode === "logs"   && <Text color="blue">◉ streaming</Text>}
          {!busy && mode === "output" && <Text color="green">✓ done</Text>}
          {!busy && mode === "logs"   && <Text color="gray">◎ stopped</Text>}

          {/* Scroll hint */}
          <Text dimColor>[↑↓/jk] scroll  [u/d] page  [g/G] top/btm</Text>

          {/* Exit hint */}
          <Text dimColor>
            {busy && mode === "output" ? "[esc] detach  [O] pop out  [q] home" : "[esc/q] close  [O] pop out"}
          </Text>

          {/* Copy feedback */}
          <Text dimColor>[c] copy</Text>
          {didCopy && <Text color="green">✓ copied</Text>}
        </Box>
      </Box>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <Text dimColor>{"─".repeat(iw - 2)}</Text>

      {/* ── Scrollable log content ───────────────────────────────────────── */}
      <LogViewer
        lines={lines}
        busy={busy}
        mode={mode}
        height={contentHeight}
      />

    </Box>
  );
}
