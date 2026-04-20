// src/ink/components/KeyHint.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Reusable keyboard-hint primitives.
//
//   <KeyHint k="↑↓" label="navigate" />          →  [↑↓] navigate
//   <KeyHints hints={[{ k: "↵", label: "run" }]} />
// ─────────────────────────────────────────────────────────────────────────────

import React        from "react";
import { Box, Text } from "ink";

export interface HintDef {
  k:     string;
  label: string;
}

/** Single key hint: [k] label */
export function KeyHint({ k, label }: HintDef) {
  return <Text dimColor>[{k}] {label}</Text>;
}

interface KeyHintsProps {
  hints:      HintDef[];
  marginTop?: number;
  paddingX?:  number;
  gap?:       number;
}

/** Row of key hints with consistent spacing. */
export function KeyHints({
  hints,
  marginTop = 1,
  paddingX  = 1,
  gap       = 3,
}: KeyHintsProps) {
  return (
    <Box marginTop={marginTop} paddingX={paddingX} gap={gap} flexWrap="wrap">
      {hints.map((h) => (
        <KeyHint key={h.k + h.label} k={h.k} label={h.label} />
      ))}
    </Box>
  );
}
