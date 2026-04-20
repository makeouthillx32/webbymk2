// src/ink/panels/Infra/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure panel — three sub-views toggled with [1] [2] [3]:
//
//   [1] Hosts    — live reachability of all INFRA_SERVICES
//   [2] DNS      — GoDaddy DNS record reference for unenter.live
//   [3] Ports    — GT-BE98 Pro router port-forward reference
//
// Hosts sub-view is interactive — [↑↓] to navigate, [r] to re-check selected,
// [R] to re-check all.  DNS and Ports are read-only reference tables.
// ─────────────────────────────────────────────────────────────────────────────

import React              from "react";
import { Box, Text }      from "ink";
import {
  INFRA_SERVICES, DNS_RECORDS, PORT_FORWARDS, MACHINES,
  type ServiceResult,
} from "../../infra.ts";
import { KeyHints }     from "../../components/KeyHint.tsx";
import { Pane }         from "../../components/Pane.tsx";
import { LoadingState } from "../../components/design-system/LoadingState.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InfraView = "hosts" | "dns" | "ports";

type InfraMap = Record<number, ServiceResult>;

interface InfraPanelProps {
  view:     InfraView;
  results:  InfraMap;
  selected: number;
  checking: boolean;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function resultColor(r?: ServiceResult): string {
  if (!r) return "gray";
  switch (r.status) {
    case "up":       return "green";
    case "down":     return "red";
    case "checking": return "yellow";
    default:         return "gray";
  }
}

function resultIcon(r?: ServiceResult): string {
  if (!r) return "○";
  switch (r.status) {
    case "up":       return "●";
    case "down":     return "✗";
    case "checking": return "◌";
    default:         return "○";
  }
}

function msLabel(r?: ServiceResult): string {
  if (!r || r.ms === null) return "";
  return `${r.ms}ms`;
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

const HOSTS_HINTS = [
  { k: "↑↓", label: "navigate"       },
  { k: "r",  label: "check selected" },
  { k: "R",  label: "check all"      },
];

function HostsView({ results, selected, checking }: {
  results: InfraMap; selected: number; checking: boolean;
}) {
  const machines = Array.from(new Set(INFRA_SERVICES.map((s) => s.machine)));

  return (
    <Box flexDirection="column">
      {checking && (
        <Box paddingX={1} marginBottom={1}>
          <LoadingState message="checking services…" />
        </Box>
      )}

      {machines.map((machine) => {
        const mInfo    = MACHINES[machine];
        const services = INFRA_SERVICES.filter((s) => s.machine === machine);
        const title    = [mInfo?.label ?? machine, mInfo?.ip, mInfo?.role]
          .filter(Boolean).join("  ·  ");

        return (
          <Pane key={machine} title={title} color="cyan" gap={1}>

            {services.map((svc) => {
              const idx     = INFRA_SERVICES.indexOf(svc);
              const focused = idx === selected;
              const r       = results[idx];
              return (
                <Box key={svc.label} paddingX={2} gap={2}>
                  <Text color={focused ? "cyan" : undefined} bold={focused}>
                    {focused ? "▶" : " "}
                  </Text>
                  <Text color={resultColor(r)}>{resultIcon(r)}</Text>
                  <Box width={12}>
                    <Text color={focused ? "cyan" : undefined} bold={focused}>
                      {svc.label}
                    </Text>
                  </Box>
                  <Box width={30}>
                    <Text dimColor={!focused}>{svc.subdomain}</Text>
                  </Box>
                  <Box width={8}>
                    <Text dimColor>{msLabel(r)}</Text>
                  </Box>
                  {r?.code !== null && r?.code !== undefined && (
                    <Text dimColor>HTTP {r.code}</Text>
                  )}
                </Box>
              );
            })}
          </Pane>
        );
      })}

      <KeyHints hints={HOSTS_HINTS} />
    </Box>
  );
}

function DnsView() {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={1}>
        <Text bold color="cyan">GoDaddy DNS  ·  unenter.live</Text>
      </Box>
      {DNS_RECORDS.map((rec, i) => (
        <Box key={i} paddingX={2} gap={2}>
          <Box width={8}><Text color="yellow">{rec.type}</Text></Box>
          <Box width={26}><Text dimColor>{rec.name}</Text></Box>
          <Text>{rec.value}</Text>
        </Box>
      ))}
    </Box>
  );
}

function PortsView() {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Port Forwards  ·  GT-BE98 Pro</Text>
      </Box>
      {PORT_FORWARDS.map((pf, i) => (
        <Box key={i} paddingX={2} gap={2}>
          <Box width={22}><Text>{pf.label}</Text></Box>
          <Box width={14}><Text color="yellow">{pf.ports}</Text></Box>
          <Box width={26}><Text dimColor>→  {pf.dest}</Text></Box>
          <Text dimColor>{pf.proto}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function InfraPanel({ view, results, selected, checking }: InfraPanelProps) {
  return (
    <Box flexDirection="column">

      {/* ── Sub-view tabs ────────────────────────────────────────────────── */}
      <Box paddingX={1} gap={3} marginBottom={1}>
        {(["hosts", "dns", "ports"] as const).map((v, i) => (
          <Text
            key={v}
            color={view === v ? "cyan" : undefined}
            bold={view === v}
            dimColor={view !== v}
          >
            [{i + 1}] {v.charAt(0).toUpperCase() + v.slice(1)}
          </Text>
        ))}
      </Box>

      {/* ── Active sub-view ──────────────────────────────────────────────── */}
      {view === "hosts" && (
        <HostsView results={results} selected={selected} checking={checking} />
      )}
      {view === "dns"   && <DnsView />}
      {view === "ports" && <PortsView />}

    </Box>
  );
}
