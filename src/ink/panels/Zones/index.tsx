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

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;

interface ZonesPanelProps {
  zones:        Zone[];
  zoneStatuses: StatusMap;
  selected:     number;
  emptyMessage?: string;
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓", label: "navigate"        },
  { k: "/",  label: "search"          },
  { k: "↵",  label: "actions"         },
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
}: ZonesPanelProps) {
  return (
    <Box flexDirection="column">

      {zones.length > 0
        ? zones.map((zone, i) => {
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
