// src/ink/panels/Infra/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure panel — three sub-views toggled with [1] [2] [3].
//
//   [1] Hosts    — live reachability of all services for the active environment
//   [2] DNS      — GoDaddy DNS record reference for unenter.live
//   [3] Ports    — GT-BE98 Pro router port-forward reference
//
// The service list in [1] is built from the activeEnv prop, so the displayed
// hostnames always match what was actually checked.  When activeEnv is null
// the panel falls back to the static INFRA_SERVICES list and says so.
//
// App.tsx owns the active environment state (via useEnvManager) and passes it
// here.  This panel never fetches the active environment itself.
//
//   [↑↓/jk]   navigate hosts
//   [r]        re-check focused service
//   [R]        re-check all services
//   [1/2/3]    switch sub-view
//   [q/←]     go back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from "react";
import { Box, Text, useInput }                from "../../runtimeInk.js";
import {
  INFRA_SERVICES, buildInfraServices, DNS_RECORDS, PORT_FORWARDS, MACHINES,
  type ServiceResult,
}                        from "../../infra.ts";
import type { InfraSource } from "../../../ink/hooks/useEnvManager.ts";
import type { UnaxisEnvironment } from "../../environment-store.ts";
import { environmentTypeColor }   from "../../environment-store.ts";
import { KeyHints }     from "../../components/KeyHint.tsx";
import { Pane }         from "../../components/Pane.tsx";
import { LoadingState } from "../../components/design-system/index.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InfraView = "hosts" | "dns" | "ports";

type InfraMap = Record<number, ServiceResult>;

interface InfraPanelProps {
  /** Pre-resolved active environment from useEnvManager.  Never null-fetch here. */
  activeEnv:    UnaxisEnvironment | null;
  infraSource:  InfraSource | null;
  /** True when activeEnv data is stale (Supabase unreachable or > 2× TTL). */
  envStale?:    boolean;
  /** ms since last successful env fetch (Infinity = never). */
  envDataAge?:  number;
  results:      InfraMap;
  checking:     boolean;
  onCheckInfra: (indices?: number[]) => void;
  onGoBack:     () => void;
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
  { k: "↑↓/jk", label: "navigate"       },
  { k: "r",     label: "check selected" },
  { k: "R",     label: "check all"      },
];

function ageLabel(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 90)  return `${secs}s old`;
  const mins = Math.floor(secs / 60);
  return `${mins}m old`;
}

function HostsView({
  results, selected, checking, activeEnv, infraSource, envStale, envDataAge,
}: {
  results:     InfraMap;
  selected:    number;
  checking:    boolean;
  activeEnv:   UnaxisEnvironment | null;
  infraSource: InfraSource | null;
  envStale?:   boolean;
  envDataAge?: number;
}) {
  // Build the service list from the active environment — same list that was
  // actually checked.  If no env, fall back to the static defaults.
  const services = activeEnv ? buildInfraServices(activeEnv) : INFRA_SERVICES;
  const machines = Array.from(new Set(services.map((s) => s.machine)));

  return (
    <Box flexDirection="column">

      {/* ── Source label — always explicit, never silent ─────────────────── */}
      <Box paddingX={1} marginBottom={1} gap={2}>
        {infraSource?.kind === "env" && (
          <>
            <Text dimColor>Checking:</Text>
            <Text bold color={environmentTypeColor(infraSource.type as any) as any}>
              {infraSource.name}
            </Text>
            <Text dimColor>[{infraSource.type}]</Text>
            {envStale && (
              <>
                <Text color="yellow">⚠</Text>
                <Text color="yellow" dimColor>
                  {envDataAge !== undefined && envDataAge !== Infinity
                    ? `env data ${ageLabel(envDataAge)} — service list may be stale`
                    : "env data stale — service list may be wrong"}
                </Text>
              </>
            )}
          </>
        )}
        {infraSource?.kind === "fallback" && (
          <>
            <Text dimColor>Checking:</Text>
            <Text color="yellow">fallback config</Text>
            <Text dimColor>— {infraSource.reason}</Text>
          </>
        )}
        {!infraSource && (
          <Text dimColor>Checking: — (press R to run checks)</Text>
        )}
      </Box>

      {checking && (
        <Box paddingX={1} marginBottom={1}>
          <LoadingState message="checking services…" />
        </Box>
      )}

      {machines.map((machine) => {
        const mInfo    = MACHINES[machine];
        const svcs     = services.filter((s) => s.machine === machine);
        const title    = [mInfo?.label ?? machine, mInfo?.ip, mInfo?.role]
          .filter(Boolean).join("  ·  ");

        return (
          <Pane key={machine} title={title} color="cyan" gap={1}>
            {svcs.map((svc) => {
              const idx     = services.indexOf(svc);
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

export function InfraPanel({
  activeEnv, infraSource, envStale, envDataAge,
  results, checking, onCheckInfra, onGoBack,
}: InfraPanelProps) {

  const [view,     setView]     = useState<InfraView>("hosts");
  const [selected, setSelected] = useState(0);

  const services = activeEnv ? buildInfraServices(activeEnv) : INFRA_SERVICES;

  // Run an initial check the first time this panel mounts.
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      onCheckInfra();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (input === "q" || key.leftArrow) { onGoBack(); return; }

    if (input === "1") { setView("hosts");  return; }
    if (input === "2") { setView("dns");    return; }
    if (input === "3") { setView("ports");  return; }
    if (input === "R") { onCheckInfra();    return; }

    if (view === "hosts") {
      if (key.upArrow   || input === "k") {
        setSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelected((s) => Math.min(services.length - 1, s + 1));
        return;
      }
      if (input === "r") {
        onCheckInfra([selected]);
        return;
      }
    }
  });

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
        <HostsView
          results={results}
          selected={selected}
          checking={checking}
          activeEnv={activeEnv}
          infraSource={infraSource}
          envStale={envStale}
          envDataAge={envDataAge}
        />
      )}
      {view === "dns"   && <DnsView />}
      {view === "ports" && <PortsView />}

    </Box>
  );
}
