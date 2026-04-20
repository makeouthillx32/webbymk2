// src/ink/components/Spinner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone spinner — no external hook dependencies.
//
//   <Spinner />                         braille spinner, yellow
//   <Spinner message="building…" />     with label
//   <Spinner active={false} />          shows ✓ when done
//   <Spinner color="cyan" />            custom color
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text }                   from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

interface SpinnerProps {
  message?: string;
  active?:  boolean;
  color?:   string;
}

export function Spinner({ message, active = true, color = "yellow" }: SpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 100);
    return () => clearInterval(id);
  }, [active]);

  return (
    <Box gap={1}>
      <Text color={active ? color : "green"}>
        {active ? FRAMES[frame] : "✓"}
      </Text>
      {message && <Text>{message}</Text>}
    </Box>
  );
}

// ── Convenience wrappers (keeps existing call-sites working) ──────────────────

export type SpinnerMode = "thinking" | "working" | "connecting";

export interface SpinnerWithVerbProps {
  mode?:            SpinnerMode;
  overrideMessage?: string | null;
  spinnerTip?:      string;
  leaderIsIdle?:    boolean;
  [key: string]:    unknown;
}

export function SpinnerWithVerb({ overrideMessage, spinnerTip, leaderIsIdle }: SpinnerWithVerbProps) {
  if (leaderIsIdle) {
    return (
      <Box marginTop={1}>
        <Text dimColor>❖ Idle</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" width="100%">
      <Spinner message={overrideMessage ?? "Working…"} />
      {spinnerTip && <Text dimColor>Tip: {spinnerTip}</Text>}
    </Box>
  );
}

export function BriefSpinner({ overrideMessage }: { overrideMessage?: string | null }) {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Spinner message={overrideMessage ?? "Working…"} />
    </Box>
  );
}

export function BriefIdleStatus() {
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text dimColor>Idle</Text>
    </Box>
  );
}
