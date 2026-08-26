// src/ink/components/StatusBadge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared status badge for Docker container states.
//
//   <StatusBadge status="running" />    →  ●  running   (green)
//   <StatusBadge status="missing" />    →  ○  missing   (gray, dim)
//   <StatusBadge status="unhealthy" />  →  ⚠  unhealthy (red)
// ─────────────────────────────────────────────────────────────────────────────

import React         from "react";
import { Text }      from "../runtimeInk.js";
import type { Status } from "../docker.ts";

// ── Color / icon lookup ───────────────────────────────────────────────────────

export function statusColor(s: Status): string {
  switch (s) {
    case "running":   return "green";
    case "starting":  return "yellow";
    case "unhealthy": return "red";
    case "stopped":   return "gray";
    case "missing":   return "gray";
    case "vercel":    return "cyan";
  }
}

export function statusIcon(s: Status): string {
  switch (s) {
    case "running":   return "●";
    case "starting":  return "◌";
    case "unhealthy": return "⚠";
    case "stopped":   return "○";
    case "missing":   return "○";
    case "vercel":    return "▲";
  }
}

const STATUS_LABEL: Partial<Record<Status, string>> = {
  vercel: "live (vercel)",
};

export function statusLabel(s: Status): string {
  return STATUS_LABEL[s] ?? s;
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
  const label = statusLabel(status);

  return (
    <Text color={color} dimColor={dim}>
      {iconOnly ? icon : `${icon}  ${label}`}
    </Text>
  );
}
