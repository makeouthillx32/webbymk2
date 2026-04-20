// tui/tabs/InfraTab.tsx
import React          from "react";
import { Box, Text }  from "ink";
import {
  INFRA_SERVICES,
  DNS_RECORDS,
  PORT_FORWARDS,
  MACHINES,
  type ServiceResult,
} from "../infra.ts";
import { Rule, SvcDot, HintBar, Badge }  from "../ui/primitives.tsx";
import { ListItem }                      from "../ui/ListItem.tsx";
import { ProgressBar }                   from "../ui/ProgressBar.tsx";

export type InfraView = "hosts" | "dns" | "ports";
type InfraMap = Record<number, ServiceResult>;

const MACHINE_ORDER = ["LOVE", "POWER", "WINDMILL"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function msLabel(r?: ServiceResult): string {
  if (!r || r.status === "unknown")  return "      ";
  if (r.status === "checking")       return "…     ";
  if (r.status === "down")           return "down  ";
  return `${r.ms}ms`.padEnd(7);
}

function statusColor(r?: ServiceResult): string {
  if (!r || r.status === "unknown")  return "gray";
  if (r.status === "checking")       return "yellow";
  if (r.status === "up")             return "green";
  return "red";
}

// ── Hosts sub-view ────────────────────────────────────────────────────────────

function HostsView({
  results,
  selected,
}: {
  results:  InfraMap;
  selected: number;
}) {
  let svcIdx = -1;

  return (
    <Box flexDirection="column">
      {MACHINE_ORDER.map((machineKey) => {
        const m    = MACHINES[machineKey];
        const svcs = INFRA_SERVICES.filter((s) => s.machine === machineKey);

        return (
          <Box key={machineKey} flexDirection="column" marginBottom={1}>
            {/* Machine header */}
            <Box gap={2}>
              <Text bold color="magenta">{m.label}</Text>
              <Text dimColor>{m.ip}</Text>
              <Text color="gray">· {m.role}</Text>
            </Box>
            <Rule width={64} />

            {/* Services */}
            {svcs.map((svc) => {
              svcIdx++;
              const si      = svcIdx;
              const r       = results[si];
              const focused = si === selected;

              return (
                <ListItem key={si} focused={focused}>
                  <SvcDot r={r} />
                  <Text bold={focused}>{" " + svc.label.padEnd(11)}</Text>
                  <Text dimColor={!focused}>{svc.subdomain.padEnd(28)}</Text>
                  <Text dimColor>{svc.port.padEnd(7)}</Text>
                  <Text color={statusColor(r)}>{msLabel(r)}</Text>
                  {r?.code && r.status === "up" && (
                    <Text dimColor>{r.code}</Text>
                  )}
                </ListItem>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

// ── DNS sub-view ──────────────────────────────────────────────────────────────

function DnsView() {
  return (
    <Box flexDirection="column">
      <Box gap={2} marginBottom={0}>
        <Text bold color="magenta">GoDaddy DNS</Text>
        <Text dimColor>unenter.live</Text>
        <Text color="gray">· ns53 / ns54.domaincontrol.com</Text>
      </Box>
      <Rule width={64} />
      {DNS_RECORDS.map((r, i) => (
        <Box key={i} gap={0}>
          <Text color="cyan">{r.type.padEnd(8)}</Text>
          <Text dimColor>{r.name.padEnd(22)}</Text>
          <Text>{r.value}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ── Ports sub-view ────────────────────────────────────────────────────────────

function PortsView() {
  return (
    <Box flexDirection="column">
      <Box gap={2} marginBottom={0}>
        <Text bold color="magenta">Port Forwards</Text>
        <Text dimColor>GT-BE98 Pro</Text>
        <Text color="gray">· NPM → 192.168.50.75:443/80</Text>
      </Box>
      <Rule width={64} />
      <Box marginBottom={0}>
        <Text dimColor>{"service".padEnd(18)}</Text>
        <Text dimColor>{"ports".padEnd(14)}</Text>
        <Text dimColor>{"destination".padEnd(22)}</Text>
        <Text dimColor>proto</Text>
      </Box>
      <Rule width={64} />
      {PORT_FORWARDS.map((p, i) => (
        <Box key={i}>
          <Text color={p.proto === "BOTH" ? "yellow" : "white"}>{p.label.padEnd(18)}</Text>
          <Text dimColor>{p.ports.padEnd(14)}</Text>
          <Text>{p.dest.padEnd(22)}</Text>
          <Text dimColor>{p.proto}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ── InfraTab ──────────────────────────────────────────────────────────────────

interface InfraTabProps {
  view:     InfraView;
  results:  InfraMap;
  selected: number;
  checking: boolean;
}

export function InfraTab({ view, results, selected, checking }: InfraTabProps) {
  const total   = INFRA_SERVICES.length;
  const upCount = Object.values(results).filter((r) => r.status === "up").length;
  const ratio   = total > 0 ? upCount / total : 0;

  return (
    <Box flexDirection="column" paddingX={1} gap={1}>

      {/* Sub-tab bar + health summary */}
      <Box justifyContent="space-between">
        <Box gap={1}>
          {(["hosts", "dns", "ports"] as InfraView[]).map((v) => (
            <Text key={v} bold={view === v} color={view === v ? "magenta" : "gray"}>
              {view === v ? `[${v}]` : ` ${v} `}
            </Text>
          ))}
          <Text dimColor>  1·2·3</Text>
        </Box>
        <Box gap={1}>
          {checking && <Text color="yellow">checking… </Text>}
          <ProgressBar ratio={ratio} width={12} />
          <Text color={upCount === total ? "green" : "yellow"}>
            {" "}{upCount}/{total}
          </Text>
        </Box>
      </Box>

      <Rule />

      {view === "hosts" && <HostsView results={results} selected={selected} />}
      {view === "dns"   && <DnsView />}
      {view === "ports" && <PortsView />}

      <Rule />

      {view === "hosts" ? (
        <HintBar hints={[
          { k: "jk", action: "navigate"    },
          { k: "r",  action: "recheck"     },
          { k: "R",  action: "recheck all" },
          { k: "1",  action: "hosts"       },
          { k: "2",  action: "dns"         },
          { k: "3",  action: "ports"       },
        ]} />
      ) : (
        <HintBar hints={[
          { k: "R",  action: "recheck all" },
          { k: "1",  action: "hosts"       },
          { k: "2",  action: "dns"         },
          { k: "3",  action: "ports"       },
        ]} />
      )}
    </Box>
  );
}
