// src/ink/components/LogoV2/UnaxisMark.tsx
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS logo mark — a 5×3 terminal glyph built from block characters.
// Poses animate the star's glow state.
//
// Poses:
//   default   — ✻ at mid-brightness
//   bright    — ✻ full-on, white (used during "arms-up" / excited state)
//   dim       — ✻ dimmed (used during "idle-out" / crouched)
//
// All poses occupy exactly 5 cols × 3 rows so the surrounding layout
// never shifts when the pose changes.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "../../runtimeInk.js";

// ── Pose types ────────────────────────────────────────────────────────────────

export type UnaxisMarkPose =
  | "default"
  | "arms-up"    // bright burst
  | "look-left"  // dim-left ray
  | "look-right"; // dim-right ray

type PoseStyle = {
  starColor: string;
  dimColor: boolean;
  bold: boolean;
  topRow: string;
  midRow: string;
  botRow: string;
};

// ── Pose definitions ──────────────────────────────────────────────────────────
//
// Glyph layout (5 cols wide, 3 rows tall):
//
//   row0   ╱   ╲       top rays
//   row1  ─ ✻ ─       horizontal rays + star
//   row2   ╲   ╱       bottom rays

const POSES: Record<UnaxisMarkPose, PoseStyle> = {
  default: {
    starColor: "#999999",
    dimColor:  false,
    bold:      false,
    topRow:    " ╱ ╲ ",
    midRow:    "─ ✻ ─",
    botRow:    " ╲ ╱ ",
  },
  "arms-up": {
    starColor: "cyanBright",
    dimColor:  false,
    bold:      true,
    topRow:    " ╱ ╲ ",
    midRow:    "─ ✻ ─",
    botRow:    " ╲ ╱ ",
  },
  "look-left": {
    starColor: "#666666",
    dimColor:  true,
    bold:      false,
    topRow:    " ╱   ",
    midRow:    "─ ✻  ",
    botRow:    " ╲   ",
  },
  "look-right": {
    starColor: "#666666",
    dimColor:  true,
    bold:      false,
    topRow:    "   ╲ ",
    midRow:    "  ✻ ─",
    botRow:    "   ╱ ",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  pose?: UnaxisMarkPose;
};

export function UnaxisMark({ pose = "default" }: Props = {}): React.ReactNode {
  const p = POSES[pose];
  return (
    <Box flexDirection="column">
      <Text color={p.starColor} dimColor={p.dimColor} bold={p.bold}>
        {p.topRow}
      </Text>
      <Text color={p.starColor} dimColor={p.dimColor} bold={p.bold}>
        {p.midRow}
      </Text>
      <Text color={p.starColor} dimColor={p.dimColor} bold={p.bold}>
        {p.botRow}
      </Text>
    </Box>
  );
}
