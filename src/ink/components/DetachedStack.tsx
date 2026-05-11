// src/ink/components/DetachedStack.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Multi-op background stack — shows all background operations simultaneously.
//
// Layout (stacked-paper metaphor):
//
//   ────────────────────────────────────────────────────────────
//   ⣾  Build Shop · running           [↑↓] switch  [o] hide  [↵] full
//   ┌──────────────────────────────────────────────────────────┐
//   │ Pushing layer 9d4c6b…                                    │
//   │ Layer 3f6f06: Waiting                                    │
//   └──────────────────────────────────────────────────────────┘
//    └─ ✓  Deploy Blog · done  [x] dismiss
//     └─ ⣾  Reload proxy · running
//
// The focused op is expanded; others peek out as indented shadow strips,
// creating the visual depth of papers stacked on top of each other.
//
// Key hints rendered at bottom:  [↑↓] switch  [↵] full  [x] dismiss  [X] clear done  [c] copy log
//
// Keyboard ownership: DetachedStack owns all Stack-context keys while mounted.
// It only mounts when stackOpen && ops.length > 0, so its useInput is naturally
// scoped — no keys fire when the stack pane is hidden.
// ─────────────────────────────────────────────────────────────────────────────

import React                                   from "react";
import { Box, Text, useInput }                 from "ink";
import { Divider }                             from "./Divider.tsx";
import { Spinner }                             from "./Spinner.tsx";
import { LoadingState }                        from "./design-system/LoadingState.tsx";
import { useWidths }                           from "../hooks/useTermWidth.ts";
import { useRegisterKeybindingContext }        from "../KeybindingContext.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StackOp {
  id:    number;
  title: string;
  lines: string[];
  busy:  boolean;
  isLog: boolean;   // log-tail ops need special kill handling
}

interface DetachedStackProps {
  ops:           StackOp[];
  focusedId:     number | null;   // id of the op shown expanded
  /** True for 1.5 s after a successful [c] copy — triggers inline flash */
  didCopy?:      boolean;

  // ── Keyboard callbacks ─────────────────────────────────────────────────────
  // App.tsx holds all the state; these callbacks let DetachedStack own the
  // useInput registration while keeping state changes co-located with their data.
  onUp?:         () => void;   // j / ↑
  onDown?:       () => void;   // k / ↓
  onEnter?:      () => void;   // ↵  — open focused op as full-screen overlay
  onDismiss?:    () => void;   // x  — dismiss focused done op
  onDismissAll?: () => void;   // X  — clear all done ops
  onPopout?:     () => void;   // O  — pop focused op to external terminal
  onCopy?:       () => void;   // c  — copy focused op log to clipboard
  onClose?:      () => void;   // q/esc — dismiss stack, return focus to panel
}

// ── Shadow strip — one collapsed op underneath the focused one ────────────────

function ShadowStrip({ op, depth }: { op: StackOp; depth: number }) {
  return (
    <Box paddingLeft={depth + 1} gap={1}>
      <Text dimColor>{"└─"}</Text>
      <Spinner active={op.busy} color={op.busy ? "yellow" : "green"} />
      <Text color={op.busy ? "yellow" : undefined} dimColor={!op.busy}>
        {op.title}
      </Text>
      {!op.busy && <Text dimColor>  [x] dismiss</Text>}
    </Box>
  );
}

// ── Main stack component ──────────────────────────────────────────────────────

const LOG_LINES = 8;

export function DetachedStack({
  ops, focusedId, didCopy,
  onUp, onDown, onEnter, onDismiss, onDismissAll, onPopout, onCopy, onClose,
}: DetachedStackProps) {
  const { dw } = useWidths();

  // Declare Stack as the active keybinding context while pane is mounted.
  // DetachedStack only renders when stackOpen && ops.length > 0, so this
  // context is only active while the pane is actually visible.
  useRegisterKeybindingContext('Stack');

  // Own all stack-pane keyboard input.  No chord keys here — all single-stroke.
  useInput((input, key) => {
    if (key.escape || input === "q") { onClose?.();    return; }
    if (key.upArrow   || input === "k") { onUp?.();         return; }
    if (key.downArrow || input === "j") { onDown?.();       return; }
    if (key.return)                     { onEnter?.();      return; }
    if (input === "x")                  { onDismiss?.();    return; }
    if (input === "X")                  { onDismissAll?.(); return; }
    if (input === "O")                  { onPopout?.();     return; }
    if (input === "c")                  { onCopy?.();       return; }
  });

  if (ops.length === 0) return null;

  // Focused op is shown expanded; all others are shadow strips below it.
  const focused  = ops.find((o) => o.id === focusedId) ?? ops[ops.length - 1]!;
  const rest     = ops.filter((o) => o.id !== focused.id);
  const visible  = focused.lines.slice(-LOG_LINES);

  const runCount  = ops.filter((o) =>  o.busy).length;
  const doneCount = ops.filter((o) => !o.busy).length;

  const statusTag = ops.length > 1
    ? [
        runCount  > 0 && `${runCount} running`,
        doneCount > 0 && `${doneCount} done`,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <Box flexDirection="column" marginTop={1}>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <Divider width={dw} />

      {/* ── Focused op header ──────────────────────────────────────────────── */}
      <Box justifyContent="space-between" paddingX={1} marginBottom={0}>
        <Box gap={1}>
          <Spinner active={focused.busy} color={focused.busy ? "yellow" : "green"} />
          <Text bold color={focused.busy ? "yellow" : "green"}>
            {focused.title}
          </Text>
          {!focused.busy && <Text dimColor>— done</Text>}
          {statusTag !== "" && (
            <Text dimColor>  ·  {statusTag}</Text>
          )}
        </Box>
        <Box gap={2}>
          {rest.length > 0 && <Text dimColor>[↑↓] switch</Text>}
          <Text dimColor>[o] hide  [O] pop out  [↵] full</Text>
        </Box>
      </Box>

      {/* ── Focused op output ──────────────────────────────────────────────── */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={focused.busy ? "yellow" : "green"}
        paddingX={1}
        width={dw}
      >
        {visible.length === 0 ? (
          <LoadingState message="starting…" dimColor />
        ) : (
          visible.map((line, i) => {
            const isLast = i === visible.length - 1;
            const isOk   = line.startsWith("OK:");
            const isErr  = line.startsWith("FAILED") || line.startsWith("ERR");
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

      {/* ── Shadow strips — stacked-paper depth effect ─────────────────────── */}
      {rest.map((op, depth) => (
        <ShadowStrip key={op.id} op={op} depth={depth} />
      ))}

      {/* ── Hints bar ──────────────────────────────────────────────────────── */}
      <Box gap={3} paddingX={1} marginTop={0}>
        {doneCount > 0 && <Text dimColor>[x] dismiss focused</Text>}
        {doneCount > 1  && <Text dimColor>[X] clear all done</Text>}
        <Text dimColor>[c] copy log</Text>
        <Text dimColor>[O] pop out</Text>
        {didCopy && <Text color="green">copied</Text>}
      </Box>

    </Box>
  );
}
