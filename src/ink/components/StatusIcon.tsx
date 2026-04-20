// tui/components/StatusIcon.tsx
// API-compatible with src/components/design-system/StatusIcon.tsx
//
// Core props: status, withSpace?
// TUI-only statuses: running, restarting, checking, missing
// Backward-compat alias: pad (same as withSpace)

import React    from "react";
import { Text } from "ink";

type CoreStatus = "success" | "error" | "warning" | "info" | "pending" | "loading";
type TuiStatus  = "running" | "restarting" | "checking" | "missing";
export type IconStatus = CoreStatus | TuiStatus;

export interface StatusIconProps {
  status:     IconStatus;
  withSpace?: boolean;  // core API
  pad?:       boolean;  // backward-compat alias
}

const CONFIG: Record<IconStatus, { icon: string; color: string; dim?: boolean }> = {
  success:    { icon: "✓", color: "green"               },
  error:      { icon: "✗", color: "red"                 },
  warning:    { icon: "⚠", color: "yellow"              },
  info:       { icon: "ℹ", color: "cyan"                },
  pending:    { icon: "○", color: "gray",   dim: true   },
  loading:    { icon: "…", color: "yellow", dim: true   },
  running:    { icon: "●", color: "green"               },
  restarting: { icon: "◑", color: "yellow"              },
  checking:   { icon: "…", color: "yellow", dim: true   },
  missing:    { icon: "○", color: "gray",   dim: true   },
};

export function StatusIcon({ status, withSpace, pad }: StatusIconProps) {
  const { icon, color, dim } = CONFIG[status] ?? CONFIG.pending;
  const space = withSpace ?? pad ?? false;
  return (
    <Text color={color} dimColor={dim}>
      {icon}{space ? " " : ""}
    </Text>
  );
}
