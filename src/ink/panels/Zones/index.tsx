// src/ink/panels/Zones/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Zone list panel — shows deployable zones only.
// Core (key="unenter") and proxy are filtered out upstream in ZonesView and
// never reach this component.
// ─────────────────────────────────────────────────────────────────────────────

import React         from "react";
import { Box, Text } from "../../runtimeInk.js";
import type { Zone } from "../../../config/zones.ts";
import type { Status } from "../../docker.ts";
import { StatusBadge } from "../../components/StatusBadge.tsx";
import { KeyHints }    from "../../components/KeyHint.tsx";
import { useScrollIntoView } from "../../components/ScrollBox.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;

interface ZonesPanelProps {
  zones:         Zone[];
  zoneStatuses:  StatusMap;
  selected:      number;
  emptyMessage?: string;
  environments?: Record<string, string>;
}

// ── ZonesPanelRow Component ───────────────────────────────────────────────────

function ZonesPanelRow({ zone, status, focused, envName }: {
  zone:     Zone;
  status:   Status;
  focused:  boolean;
  envName?: string;
}) {
  const ref = React.useRef<any>(null);
  useScrollIntoView(ref, focused);

  const isRemote = Boolean(envName && envName.toUpperCase() !== "POWER" && envName.toUpperCase() !== "LOCAL");
  const badgeColor = isRemote ? "magenta" : "blue";
  const badgeText = envName ? `[${envName.toUpperCase()}]` : "[POWER]";

  return (
    <Box ref={ref} paddingX={1} gap={2}>
      <Text color={focused ? "cyan" : undefined} bold={focused}>
        {focused ? "▶" : " "}
      </Text>
      <Box width={16}>
        <Text color={focused ? "cyan" : undefined} bold={focused}>
          {zone.label}
        </Text>
      </Box>
      <Box width={8}>
        <Text color={badgeColor} bold={isRemote}>
          {badgeText}
        </Text>
      </Box>
      <Box width={26}>
        <Text dimColor={!focused}>{zone.domain}</Text>
      </Box>
      <StatusBadge status={status} />
    </Box>
  );
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓", label: "navigate"        },
  { k: "/",  label: "search"          },
  { k: "↵",  label: "actions"         },
  { k: "b",  label: "ship (build+deploy)" },
  { k: "l",  label: "logs"            },
  { k: "n",  label: "new zone"        },
  { k: "g",  label: "git push"        },
  { k: "S",  label: "sync routes"     },
  { k: "R",  label: "rebuild proxy"   },
  { k: "a",  label: "build+push all"  },
  { k: "A",  label: "deploy all"      },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function ZonesPanel({
  zones,
  zoneStatuses,
  selected,
  emptyMessage = "No zones yet — press [n] to create one",
  environments = {},
}: ZonesPanelProps) {
  return (
    <Box flexDirection="column">

      {zones.length > 0
        ? zones.map((zone, i) => {
            const status  = zoneStatuses[zone.key] ?? "missing";
            const focused = i === selected;
            const envName = (zone.environmentId && environments[zone.environmentId])
              ? environments[zone.environmentId]
              : "POWER";
            return (
              <ZonesPanelRow
                key={zone.key}
                zone={zone}
                status={status}
                focused={focused}
                envName={envName}
              />
            );
          })
        : (
          <Box paddingX={2} marginTop={1}>
            <Text dimColor>{emptyMessage}</Text>
          </Box>
        )
      }

      <KeyHints hints={HINTS} />

    </Box>
  );
}
