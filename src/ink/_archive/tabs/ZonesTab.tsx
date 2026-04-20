// tui/tabs/ZonesTab.tsx
import React from "react";
import { Box, Text } from "ink";
import { ZONES, PROXY, type Zone } from "../../config/zones.ts";
import { type Status }             from "../docker.ts";
import { Dot, Rule, HintBar }      from "../ui/primitives.tsx";
import { ListItem }                from "../ui/ListItem.tsx";

type StatusMap = Record<string, Status>;

function ZoneRow({
  zone,
  status,
  focused,
}: {
  zone:    Zone;
  status:  Status;
  focused: boolean;
}) {
  return (
    <ListItem focused={focused}>
      <Text bold={focused}>{zone.key.padEnd(10)}</Text>
      <Dot status={status} />
      <Text dimColor={!focused}>{"  " + zone.domain.padEnd(26)}</Text>
      <Text dimColor>{zone.container}</Text>
      {zone.dockerfile && <Text color="blue" dimColor>  [b]</Text>}
    </ListItem>
  );
}

interface ZonesTabProps {
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
  selected:     number;
}

export function ZonesTab({ zoneStatuses, proxyStatus, selected }: ZonesTabProps) {
  return (
    <Box flexDirection="column">
      {/* Proxy status bar */}
      <Box gap={2} marginBottom={1}>
        <Text dimColor>proxy</Text>
        <Dot status={proxyStatus} />
        <Text dimColor>{PROXY.container}  :{PROXY.port}</Text>
        <Text color="blue" dimColor>  [R] reload</Text>
      </Box>

      <Rule title="zones" />

      {/* Column header */}
      <Box marginLeft={3} gap={0}>
        <Text dimColor>{"zone".padEnd(12)}</Text>
        <Text dimColor>{"  "}</Text>
        <Text dimColor>{"domain".padEnd(26)}</Text>
        <Text dimColor>container</Text>
      </Box>

      {ZONES.map((zone, i) => (
        <ZoneRow
          key={zone.key}
          zone={zone}
          status={zoneStatuses[zone.key] ?? "missing"}
          focused={selected === i}
        />
      ))}

      <Rule />

      <HintBar hints={[
        { k: "jk", action: "navigate"     },
        { k: "r",  action: "restart"      },
        { k: "p",  action: "pull+up"      },
        { k: "d",  action: "deploy"       },
        { k: "b",  action: "build only"   },
        { k: "l",  action: "logs"         },
        { k: "g",  action: "git push"     },
        { k: