// src/ink/panels/Zones/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Zone list panel — shows every zone with its live container status.
//
// Keyboard hints shown at the bottom:
//   [↑↓] navigate  [↵] actions  [l] logs  [n] new zone
//   [g] git push   [R] reload proxy   [a] build+push all   [A] deploy all
// ─────────────────────────────────────────────────────────────────────────────

import React              from "react";
import { Box, Text }      from "ink";
import type { Zone }      from "../../../config/zones.ts";
import type { Status }    from "../../docker.ts";
import { StatusBadge }    from "../../components/StatusBadge.tsx";
import { KeyHints }       from "../../components/KeyHint.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;

interface ZonesPanelProps {
  zones:        Zone[];
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
  selected:     number;
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓", label: "navigate"        },
  { k: "↵",  label: "actions"         },
  { k: "l",  label: "logs"            },
  { k: "n",  label: "new zone"        },
  { k: "g",  label: "git push"        },
  { k: "R",  label: "reload proxy"    },
  { k: "a",  label: "build+push all"  },
  { k: "A",  label: "deploy all"      },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function ZonesPanel({ zones, zoneStatuses, proxyStatus, selected }: ZonesPanelProps) {
  return (
    <Box flexDirection="column">

      {/* ── Zone rows ───────────────────────────────────────────────────── */}
      {zones.map((zone, i) => {
        const status  = zoneStatuses[zone.key] ?? "missing";
        const focused = i === selected;
        return (
          <Box key={zone.key} paddingX={1} gap={2}>
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? "▶" : " "}
            </Text>
            <Box width={18}>
              <Text color={focused ? "cyan" : undefined} bold={focused}>
                {zone.label}
              </Text>
            </Box>
            <Box width={28}>
              <Text dimColor={!focused}>{zone.domain}</Text>
            </Box>
            <StatusBadge status={status} />
          </Box>
        );
      })}

      {/* ── Proxy row ───────────────────────────────────────────────────── */}
      <Box marginTop={1} paddingX={1} gap={2}>
        <Text dimColor>  </Text>
        <Box width={18}><Text dimColor>proxy</Text></Box>
        <Box width={28}><Text dimColor>nginx-proxy-manager</Text></Box>
        <StatusBadge status={proxyStatus} />
      </Box>

      <KeyHints hints={HINTS} />

    </Box>
  );
}
