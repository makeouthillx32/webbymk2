// src/ink/screens/StackManagerScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen background-op manager — shows ALL ops regardless of strip state.
//
// Layout:
//
//   ── BACKGROUND OPS  ·  3 running  ·  2 done ─────────────────────────
//   ▶ ⣾  Build Shop                                          [r] running
//     │ Pushing layer 9d4c6b…
//     │ Layer 3f6f06: Waiting
//     │ ✓ pushed
//   ──────────────────────────────────────────────────────────────────────
//     ✓  Deploy Blog                                             done
//     ⣾  Reload proxy                                         [r] running
//     ✓  Dev  Auth                                          [x] dismiss
//
//   [↑↓] navigate   [↵] full screen   [x] dismiss   [X] clear done   [q] close
//
// Keyboard: ↑↓/jk navigate, ↵ view full-screen overlay, x dismiss focused,
//           X clear all done, O pop out focused, c copy focused, q/esc close.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text, useInput } from "ink";
import type { StackOp } from "../ink/components/DetachedStack.jsx";
import { Spinner } from "../ink/components/Spinner.jsx";
import { statusColor } from "../ink/components/StatusBadge.jsx";
import { KeyHints } from "../ink/components/KeyHint.jsx";
import { Divider } from "../ink/components/Divider.jsx";
import { useWidths } from "../ink/hooks/useTermWidth.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StackManagerScreenProps {
  ops: StackOp[];
  focusedId: number | null;
  didCopy?: boolean;

  onUp?: () => void;
  onDown?: () => void;
  onEnter?: () => void;   // open focused op in full-screen overlay
  onDismiss?: () => void;   // dismiss focused op
  onDismissAll?: () => void;   // clear all done ops
  onPopout?: () => void;   // pop out focused op
  onCopy?: () => void;   // copy focused op log
  onClose?: () => void;   // close manager (q / esc)
}

// ── Preview lines ─────────────────────────────────────────────────────────────

const PREVIEW_LINES = 6;

// ── Component ─────────────────────────────────────────────────────────────────

export function StackManagerScreen({
  ops, focusedId, didCopy,
  onUp, onDown, onEnter, onDismiss, onDismissAll, onPopout, onCopy, onClose,
}: StackManagerScreenProps) {
  const { dw } = useWidths();

  useInput((input, key) => {
    if (key.escape || input === "q") { onClose?.(); return; }
    if (key.upArrow || input === "k") { onUp?.(); return; }
    if (key.downArrow || input === "j") { onDown?.(); return; }
    if (key.return) { onEnter?.(); return; }
    if (input === "x") { onDismiss?.(); return; }
    if (input === "X") { onDismissAll?.(); return; }
    if (input === "O") { onPopout?.(); return; }
    if (input === "c") { onCopy?.(); return; }
  });

  if (ops.length === 0) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text dimColor>No background ops.</Text>
        <Text dimColor>Start a deploy, build, or dev container to see them here.</Text>
      </Box>
    );
  }

  const focused = ops.find((o) => o.id === focusedId) ?? ops[ops.length - 1]!;
  const runCount = ops.filter((o) => o.busy && !(o.dismissable)).length;
  const doneCount = ops.filter((o) => !o.busy || o.dismissable).length;

  const countLabel = [
    runCount > 0 && `${runCount} running`,
    doneCount > 0 && `${doneCount} done`,
  ].filter(Boolean).join("  ·  ");

  const HINTS = [
    { k: "↑↓", label: "navigate" },
    { k: "↵", label: "full screen" },
    { k: "x", label: "dismiss" },
    { k: "X", label: "clear done" },
    { k: "O", label: "pop out" },
    { k: "c", label: "copy" },
    { k: "q", label: "close" },
  ];

  return (
    <Box flexDirection="column">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Divider width={dw} title={`BACKGROUND OPS  ·  ${countLabel}`} />

      {/* ── Op list ────────────────────────────────────────────────────────── */}
      {ops.map((op) => {
        const isFocused = op.id === focused.id;
        const canDismiss = op.dismissable ?? !op.busy;
        const preview = op.lines.slice(-PREVIEW_LINES);

        return (
          <Box key={op.id} flexDirection="column" marginBottom={isFocused ? 0 : 0}>

            {/* ── Row header ─────────────────────────────────────────────── */}
            <Box paddingX={1} gap={2}>
              {/* Selection cursor */}
              <Text color={isFocused ? "cyan" : undefined} bold={isFocused}>
                {isFocused ? "▶" : " "}
              </Text>

              {/* Busy spinner / done check */}
              <Spinner active={op.busy && !op.dismissable} color={op.busy && !op.dismissable ? "yellow" : "green"} />

              {/* Title */}
              <Box flexGrow={1}>
                <Text
                  bold={isFocused}
                  color={isFocused ? "cyan" : (op.busy && !op.dismissable ? "yellow" : undefined)}
                  dimColor={!isFocused && !op.busy}
                >
                  {op.title}
                </Text>
              </Box>

              {/* Status tag */}
              <Box gap={1}>
                {canDismiss && <Text dimColor>[x]</Text>}
                <Text dimColor color={op.busy && !op.dismissable ? "yellow" : "green"}>
                  {op.dismissable ? "live" : op.busy ? "running" : "done"}
                </Text>
              </Box>
            </Box>

            {/* ── Inline output preview (focused op only) ─────────────────── */}
            {isFocused && (
              <Box
                flexDirection="column"
                borderStyle="single"
                borderColor="cyan"
                paddingX={2}
                marginX={2}
                marginBottom={1}
              >
                {preview.length === 0 ? (
                  <Text dimColor>starting…</Text>
                ) : (
                  preview.map((line, i) => {
                    const isLast = i === preview.length - 1;
                    const isOk = line.startsWith("✓") || line.startsWith("OK:");
                    const isErr = line.startsWith("✗") || line.startsWith("FAILED") || line.startsWith("ERR");
                    return (
                      <Text
                        key={i}
                        color={isErr ? "red" : isOk ? "green" : undefined}
                        dimColor={!isOk && !isErr && !isLast}
                      >
                        {line}
                      </Text>
                    );
                  })
                )}
              </Box>
            )}

          </Box>
        );
      })}

      {/* ── Hints ──────────────────────────────────────────────────────────── */}
      <Divider width={dw} />
      <Box paddingX={1} gap={1}>
        <KeyHints hints={HINTS} />
        {didCopy && <Text color="green">  copied</Text>}
      </Box>

    </Box>
  );
}
