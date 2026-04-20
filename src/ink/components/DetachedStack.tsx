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
// ─────────────────────────────────────────────────────────────────────────────

import React                          from "react";
import { Box, Text }                  from "ink";
import { Divider }                    from "./Divider.tsx";
import { Spinner }                    from "./Spinner.tsx";
import { LoadingState }               from "./design-system/LoadingState.tsx";
import { useWidths }                  from "../hooks/useTermWidth.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StackOp {
  id:    number;
  title: string;
  lines: string[];
  busy:  boolean;
  isLog: boolean;   // log-tail ops need special kill handling
}

interface DetachedStackProps {
  ops:       StackOp[];
  focusedId: number | null;   // id of the op shown expanded
  /** True for 1.5 s after a successful [c] copy — triggers inline flash */
  didCopy?:  boolean;
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

export function DetachedStack({ ops, focusedId, didCopy }: DetachedStackProps) {
  const { dw } = useWidths();
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
          <Text dimColor>[o] hide  [↵] full</Text>
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
            const isOk   = line.startsWith("✓") || line.startsWith("OK:");
            const isErr  = line.startsWith("✗") || line.startsWith("FAILED") || line.startsWith("⚠");
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
        {didCopy && <Text color="green">✓ copied</Text>}
      </Box>

    </Box>
  );
}
