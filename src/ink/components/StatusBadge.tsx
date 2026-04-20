// src/ink/components/StatusBadge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared status badge for Docker container states.
//
//   <StatusBadge status="running" />    →  ●  running   (green)
//   <StatusBadge status="missing" />    →  ○  missing   (gray, dim)
//   <StatusBadge status="unhealthy" />  →  ⚠  unhealthy (red)
// ─────────────────────────────────────────────────────────────────────────────

import React         from "react";
import { Text }      from "ink";
import type { Status } from "../docker.ts";

// ── Color / icon lookup ───────────────────────────────────────────────────────

export function statusColor(s: Status): string {
  switch (s) {
    case "running":   return "green";
    case "starting":  return "yellow";
    case "unhealthy": return "red";
    case "stopped":   return "gray";
    case "missing":   return "gray";
  }
}

export function statusIcon(s: Status): string {
  switch (s) {
    case "running":   return "●";
    case "starting":  return "◌";
    case "unhealthy": return "⚠";
    case "stopped":   return "○";
    case "missing":   return "○";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: Status;
  /** When true, omit the label text — icon only */
  iconOnly?: boolean;
}

export function StatusBadge({ status, iconOnly = false }: StatusBadgeProps) {
  const color = statusColor(status);
  const icon  = statusIcon(status);
  const dim   = (status === "missing" || status === "stopped");

  return (
    <Text color={color} dimColor={dim}>
      {iconOnly ? icon : `${icon}  ${status}`}
    </Text>
  );
}
