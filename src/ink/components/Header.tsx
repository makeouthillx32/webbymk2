// src/ink/components/Header.tsx
// ─────────────────────────────────────────────────────────────────────────────
// App header bar — live clock + background-op summary.
//
//   left:   UNAXIS  v0.0.x  [dev]  ·  Unified Next App eXecution & Infrastructure System
//   right:  [spinner + op title]  ·  HH:MM:SS
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text }                  from "ink";
import type { StackOp }               from "./DetachedStack.tsx";

declare const UNAXIS_VERSION: string | undefined;
const VERSION = typeof UNAXIS_VERSION === "string" ? UNAXIS_VERSION : "0.0.5";

const FULL_NAME = "Unified Next App eXecution & Infrastructure System";
const isDev     = process.env.NODE_ENV !== "production";

// ── useClock ──────────────────────────────────────────────────────────────────

export function useClock(): string {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour12: false })
  );
  useEffect(() => {
    const id = setInterval(
      () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false })),
      1_000,
    );
    return () => clearInterval(id);
  }, []);
  return time;
}

// ── useSpinner ────────────────────────────────────────────────────────────────

const FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"] as const;

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, [active]);
  return FRAMES[frame];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the "[o] …" hint text based on current stack state. */
function buildOHint(focused: boolean, open: boolean, count: number): string {
  if (focused) return "[o] back";
  if (open) return "[o] interact  [O] stack view";
  return "[o] show " + count + " op" + (count === 1 ? "" : "s");
}

// ── Header component ──────────────────────────────────────────────────────────

interface HeaderProps {
  ops:          StackOp[];
  stackOpen:    boolean;
  stackFocused: boolean;
}

export function Header({ ops, stackOpen, stackFocused }: HeaderProps) {
  const time    = useClock();
  const spinner = useSpinner(ops.some((o) => o.busy));

  const runCount  = ops.filter((o) =>  o.busy).length;
  const doneCount = ops.filter((o) => !o.busy).length;
  const topOp     = ops.find((o) => o.busy) ?? ops[ops.length - 1] ?? null;
  const hasOps    = ops.length > 0;

  // [o] hint reflects the real toggle state so the user knows what pressing it does.
  const oHint = buildOHint(stackFocused, stackOpen, ops.length);

  return (
    <Box justifyContent="space-between" marginBottom={0}>
      <Box gap={2}>
        <Text bold color="cyan">UNAXIS</Text>
        <Text dimColor color="cyan">v{VERSION}</Text>
        {isDev && <Text bold color="magenta">dev</Text>}
        <Text dimColor>·</Text>
        <Text dimColor>{FULL_NAME}</Text>
      </Box>
      <Box gap={2}>
        {hasOps && (
          <Box gap={1}>
            {runCount > 0 ? (
              <>
                <Text color="yellow">{spinner}</Text>
                <Text color="yellow">{topOp?.title ?? "running"}</Text>
                {ops.length > 1 && <Text dimColor>+{ops.length - 1}</Text>}
              </>
            ) : (
              <>
                <Text color="green">✓</Text>
                <Text dimColor>{doneCount} done</Text>
              </>
            )}
            <Text dimColor>·</Text>
            <Text dimColor>{stackOpen ? "[o] hide stack" : "[o] stack"}</Text>
          </Box>
        )}
        <Text dimColor>·</Text>
        <Text dimColor>{time}</Text>
      </Box>
    </Box>
  );
}
