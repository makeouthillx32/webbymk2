// tui/screens/DashboardScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Main operational dashboard — shown after the welcome screen.
//
// Layout (top → bottom):
//   1. Compact routing chain with live health dots
//   2. Rule
//   3. Navigable zone list  ← cursor lives here
//   4. Rule
//   5. Minimal hint bar
//
// The routing chain stays at the top as a persistent reminder of the
// architecture — so operators always know what they're looking at.
// ─────────────────────────────────────────────────────────────────────────────

import React        from "react";
import { Box, Text } from "ink";
import { ZONES, PROXY }         from "../../config/zones.ts";
import { STACK_HOST, NPM_HOST } from "../../config/stack.ts";
import { type Status }          from "../docker.ts";
import { Dot, Rule, HintBar }   from "../ui/primitives.tsx";
import { ListItem }             from "../ui/ListItem.tsx";

type StatusMap = Record<string, Status>;

export interface DashboardScreenProps {
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
  selected:     number;
}

export function DashboardScreen({ zoneStatuses, proxyStatus, selected }: DashboardScreenProps) {
  return (
    <Box flexDirection="column">

      {/* ── Compact routing chain ─────────────────────────────────────────── */}
      <Box flexDirection="column" marginBottom={1}>

        {/* Row 1: internet → NPM */}
        <Box>
          <Text dimColor>internet ──▶ </Text>
          <Text bold color="cyan">◈ NPM</Text>
          <Text dimColor>
            {" · " + NPM_HOST.label + " · :" + NPM_HOST.port}
          </Text>
          <Text color="green" dimColor>{"   SSL · Let's Encrypt"}</Text>
        </Box>

        {/* Row 2: └──▶ proxy */}
        <Box>
          <Text color="gray">{"            └──▶ "}</Text>
          <Text bold color="cyan">◈ proxy</Text>
          <Text> </Text>
          <Dot status={proxyStatus} />
          <Text dimColor>
            {" · " + STACK_HOST.label + " · :" + PROXY.port}
          </Text>
          <Text dimColor>{"   Host-header routing"}</Text>
        </Box>

        {/* Row 3: └──▶ zones */}
        <Box>
          <Text color="gray">{"                 └──▶ "}</Text>
          {ZONES.map((z, i) => {
            const s = zoneStatuses[z.key] ?? "missing";
            return (
              <Box key={z.key} marginLeft={i === 0 ? 0 : 2}>
                <Dot status={s} />
                <Text dimColor>{" " + z.key}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Rule />

      {/* ── Zone list ─────────────────────────────────────────────────────── */}
      <Box flexDirection="column">
        {ZONES.map((zone, i) => {
          const s       = zoneStatuses[zone.key] ?? "missing";
          const focused = selected === i;
          return (
            <ListItem key={zone.key} focused={focused}>
              <Dot status={s} />
              <Text bold={focused}>
                {"  " + zone.key.padEnd(8)}
              </Text>
              <Text dimColor={!focused}>
                {zone.domain.padEnd(28)}
              </Text>
              <Text color={statusColor(s)} dimColor={!focused}>
                {s}
              </Text>
              {zone.dockerfile && (
                <Text color="blue" dimColor>{"  [b]"}</Text>
              )}
            </ListItem>
          );
        })}
      </Box>

      <Rule />

      {/* ── Hint bar ──────────────────────────────────────────────────────── */}
      <HintBar hints={[
        { k: "↑↓",  action: "select"        },
        { k: "↵",   action: "actions"       },
        { k: "l",   action: "logs"          },
        { k: "g",   action: "git push"      },
        { k: "R",   action: "reload proxy"  },
        { k: "Tab", action: "db · infra"    },
        { k: "q",   action: "quit"          },
      ]} />

    </Box>
  );
}

function statusColor(s: Status): string {
  if (s === "running")   return "green";
  if (s === "starting")  return "cyan";
  if (s === "unhealthy") return "red";
  if (s === "stopped")   return "red";
  return "yellow";
}
