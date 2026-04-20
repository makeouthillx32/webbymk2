// tui/ui/ProgressBar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Sub-character block progress bar — mirrors ProgressBar.tsx from design-system.
// Uses the same 8-block sequence for smooth fractional fill.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Text } from "ink";

const BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

interface ProgressBarProps {
  /** Value between 0 and 1 */
  ratio:       number;
  /** Total character width of the bar */
  width:       number;
  fillColor?:  string;
  emptyColor?: string;
  /** Show percentage label after the bar */
  showPct?:    boolean;
}

export function ProgressBar({
  ratio,
  width,
  fillColor  = "cyan",
  emptyColor = "gray",
  showPct    = false,
}: ProgressBarProps) {
  const r     = Math.min(1, Math.max(0, ratio));
  const whole = Math.floor(r * width);
  const rem   = r * width - whole;
  const mid   = Math.floor(rem * BLOCKS.length);
  const empty = width - whole - (whole < width ? 1 : 0);

  const filled  = BLOCKS[BLOCKS.length - 1].repeat(whole);
  const partial = whole < width ? BLOCKS[mid] : "";
  const blank   = BLOCKS[0].repeat(Math.max(0, empty));

  return (
    <>
      <Text color={fillColor}>{filled}{partial}</Text>
      <Text color={emptyColor} dimColor>{blank}</Text>
      {showPct && <Text dimColor> {Math.round(r * 100)}%</Text>}
    </>
  );
}
