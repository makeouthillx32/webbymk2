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

import React                from "react";
import { Box, Text, useInput } from "ink";
import { useWidths }        from "./hooks/useTermWidth.ts";
import { useTermHeight }    from "./hooks/useTermWidth.ts";
import { LogViewer }        from "./components/LogViewer.tsx";
import { useRegisterKeybindingContext } from "./KeybindingContext.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpView = "output" | "logs";

interface OperationOverlayProps {
  title:    string;
  lines:    string[];
  busy:     boolean;
  mode:     OpView;
  /** True for 1.5 s after a successful [c] copy — triggers inline flash */
  didCopy?: boolean;
  /**
   * True when this op is a live dev-mode container (dismissable=true).
   * Changes esc behaviour: esc triggers onKill (stop+close) instead of onEsc (detach).
   * Also changes the hint text shown in the header.
   */
  dismissable?: boolean;
  /** Called when user presses [q] — always detaches back to the strip */
  onQ?:     () => void;
  /** Called when user presses [esc] on a non-dismissable op — detach */
  onEsc?:   () => void;
  /**
   * Called when user presses [esc] on a dismissable op (dev-mode).
   * Should trigger the dismiss hook (stop container) then close the overlay.
   */
  onKill?:  () => void;
  /** Called when user presses [enter] (only fires when !busy) */
  onEnter?: () => void;
  /** Called when user presses [c] (copy all buffered lines) */
  onCopy?:     () => void;
  /** Called when user presses [C] (copy only visible tail lines) */
  onCopyTail?: (lines: string[]) => void;
  /** Called when user presses [O] (pop out to terminal) */
  onPopout?: () => void;
}

// ── Chrome constants ──────────────────────────────────────────────────────────

/**
 * Number of terminal rows consumed by the overlay's own chrome:
 *   top border (1) + header bar (1) + divider (1) + bottom border (1)
 * Subtracted from terminal height to get the usable LogViewer height.
 */
const CHROME_ROWS = 4;

// ── Component ─────────────────────────────────────────────────────────────────

export function OperationOverlay({
  title, lines, busy, mode, didCopy, dismissable,
  onQ, onEsc, onKill, onEnter, onCopy, onCopyTail, onPopout,
}: OperationOverlayProps) {
  const { tw, iw } = useWidths();
  const th         = useTermHeight();

  // Register as active context so the keybinding system knows we own input.
  useRegisterKeybindingContext('Overlay');

  // Rows available for scrollable log content — computed before useInput so
  // the [C] copy-tail handler can close over the correct value.
  const contentHeight = Math.max(4, th - CHROME_ROWS);

  // Own all overlay keyboard input — LogViewer's scroll keys (up/down/jk/u/d/g/G)
  // are handled inside LogViewer and don't conflict with these control keys.
  useInput((input, key) => {
    if (input === "q")       { onQ?.();                                          return; }
    if (key.escape)          { dismissable ? onKill?.() : onEsc?.();            return; }
    if (key.return && !busy) { onEnter?.();                                      return; }
    if (input === "c")       { onCopy?.();                                       return; }
    if (input === "C")       { onCopyTail?.(lines.slice(-contentHeight));        return; }
    if (input === "O")       { onPopout?.();                                      return; }
  });

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
          {busy  && mode === "output" && <Text color="yellow">running</Text>}
          {busy  && mode === "logs"   && <Text color="blue">streaming</Text>}
          {!busy && mode === "output" && <Text color="green">done</Text>}
          {!busy && mode === "logs"   && <Text color="gray">stopped</Text>}

          {/* Scroll hint */}
          <Text dimColor>[up/dn/jk] scroll  [u/d] page  [g/G] top/btm</Text>

          {/* Exit hint — esc and q do different things depending on op type */}
          <Text dimColor>
            {dismissable
              ? "[esc] stop · close  [q] back"
              : busy && mode === "output"
                ? "[esc] detach  [q] back"
                : "[esc/q] close"}
          </Text>

          {/* Copy feedback */}
          <Text dimColor>[c] copy  [C] copy tail</Text>
          {didCopy && <Text color="green">copied</Text>}
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
