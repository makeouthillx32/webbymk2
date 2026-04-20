// src/ink/OperationOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen output/log stream overlay shown during build, deploy, restart,
// log-tail, and other long-running operations.
//
// Layout:
//   ╭──────────────────────────────────────────────────────────────────────────╮
//   │  Deploy  Blog · P0W3R            ● running          [q/esc] back        │
//   │──────────────────────────────────────────────────────────────────────────│
//   │  Pulling layer 9d4c6b…                                                   │
//   │  Layer 3f6f06: Waiting                                                   │
//   │  ✓ done                                                                  │
//   ╰──────────────────────────────────────────────────────────────────────────╯
//
// mode="output"  — build/deploy: last 8 lines dimmed, newest full-bright
// mode="logs"    — log tail: all lines equal weight, cursor blink while live
// ─────────────────────────────────────────────────────────────────────────────

import React           from "react";
import { Box, Text }   from "ink";
import { LoadingState } from "./components/design-system/LoadingState.tsx";
import { useWidths }    from "./hooks/useTermWidth.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpView = "output" | "logs";

interface OperationOverlayProps {
  title:     string;
  lines:     string[];
  busy:      boolean;
  mode:      OpView;
  /** True for 1.5 s after a successful [c] copy — triggers inline flash */
  didCopy?:  boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OperationOverlay({ title, lines, busy, mode, didCopy }: OperationOverlayProps) {
  const { tw, iw }  = useWidths();
  const visible    = lines.slice(-30);
  const DIM_CUTOFF = 8;   // for "output" mode: dim everything except last N lines

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={busy ? "yellow" : "green"}
      paddingX={1}
      width={tw}
    >
      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <Box justifyContent="space-between">
        <Text bold color={busy ? "yellow" : "green"}>{title}</Text>
        <Box gap={2}>
          {busy && mode === "output" && <Text color="yellow">● running</Text>}
          {busy && mode === "logs"   && <Text color="blue">◉ streaming</Text>}
          {!busy && mode === "output" && <Text color="green">✓ done</Text>}
          {!busy && mode === "logs"   && <Text color="gray">◎ stopped</Text>}
          <Text dimColor>
            {busy && mode === "output" ? "[esc] detach  [q] home" : "[esc/q] close"}
          </Text>
          <Text dimColor>[c] copy</Text>
          {didCopy && <Text color="green">✓ copied</Text>}
        </Box>
      </Box>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <Text dimColor>{"─".repeat(iw - 2)}</Text>

      {/* ── Output lines ─────────────────────────────────────────────────── */}
      <Box flexDirection="column">
        {visible.length === 0 ? (
          <LoadingState message="starting…" dimColor />
        ) : (
          visible.map((line, i) => {
            const isOk  = line.startsWith("✓") || line.startsWith("OK:");
            const isErr = line.startsWith("✗") || line.startsWith("FAILED") || line.startsWith("⚠");
            const isNew = mode === "output" && i >= visible.length - DIM_CUTOFF;
            return (
              <Text
                key={i}
                color={isErr ? "red" : isOk ? "green" : undefined}
                dimColor={!isOk && !isErr && mode === "output" && !isNew}
              >
                {line}
              </Text>
            );
          })
        )}
        {busy && <Text color="yellow">▌</Text>}
      </Box>
    </Box>
  );
}
