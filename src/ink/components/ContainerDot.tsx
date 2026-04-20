// tui/components/ContainerDot.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docker container status dot for zone rows.
//
//   running     → ●  green
//   starting    → ◑  yellow  (container healthy check in progress)
//   unhealthy   → ◉  red
//   restarting  → ◑  yellow
//   error       → ✗  red
//   missing     → ○  dim gray
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Text } from "ink";
import type { Status } from "../docker.ts";

interface ContainerDotProps {
  status: Status;
}

const DOT_CONFIG: Record<Status, { icon: string; color: string; dim?: boolean }> = {
  running:    { icon: "●", color: "green"  },
  starting:   { icon: "◑", color: "yellow" },
  unhealthy:  { icon: "◉", color: "red"   },
  restarting: { icon: "◑", color: "yellow" },
  error:      { icon: "✗", color: "red"   },
  missing:    { icon: "○", color: "gray",  dim: true },
};

export function ContainerDot({ status }: ContainerDotProps) {
  const { icon, color, dim } = DOT_CONFIG[status] ?? DOT_CONFIG.missing;
  return <Text color={color} dimColor={dim}>{icon}</Text>;
}
