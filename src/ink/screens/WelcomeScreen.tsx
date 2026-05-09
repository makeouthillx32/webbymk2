// src/ink/screens/WelcomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Splash / home screen — fully responsive to any terminal size.
//
// Adaptive layout tiers (checked in order — first match wins):
//
//   tw  ≥ 60 AND th ≥ 24   →  full:    routing diagram + all sections
//   tw  ≥ 60               →  no-diagram: diagram hidden, rest visible
//   tw  < 60               →  narrow: diagram hidden, zones wrap to rows
//   th  < 16               →  compact: hide status section entirely
//   th  < 10               →  minimal: title + menu + hints only
//
// On resize: Ink's diff engine emits a fullResetSequence (clear + repaint)
// automatically — the layout adapts to the new dimensions in one flash.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text, useInput }        from "ink";
import type { Zone }                  from "../../config/zones.ts";
import { STACK_HOST, NPM_HOST, DOMAIN } from "../../config/stack.ts";
import { PROJECT_DIR }                from "../../config/zones.ts";
import { type Status }                from "../docker.ts";
import { ContainerDot }               from "../components/ContainerDot.tsx";
import { Divider }                    from "../components/Divider.tsx";
import { KeyHints }                   from "../components/KeyHint.tsx";
import { useWidths }                  from "../hooks/useTermWidth.ts";
import { useHostMonitor }             from "../hooks/useHostMonitor.ts";
import { MetricCard }                 from "../components/design-system/MetricCard.tsx";
import { sparkline }                  from "../utils/sparkline.ts";

// ── Color palette (terminal-safe) ─────────────────────────────────────────────
const BRAND        = "#D4A27F";   // warm amber — unt.ink accent
const BRAND_SEC    = "cyan";
const SUCCESS      = "green";
const WARNING      = "yellow";
const ERROR        = "red";
const INACTIVE     = "gray";

type StatusMap = Record<string, Status>;

export interface WelcomeScreenProps {
  zones:        Zone[];
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
  busy?:        boolean;
  onManage:     () => void;
  onSettings:   () => void;
  onQuit:       () => void;
  isActive:     boolean;
}

const MENU = [
  { icon: "▶", label: "Manage",   desc: "zones · npm · db · infrastructure" },
  { icon: "⚙", label: "Settings", desc: "view & edit local config"           },
];

export function WelcomeScreen({
  zones, zoneStatuses, proxyStatus, busy,
  onManage, onSettings, onQuit, isActive,
}: WelcomeScreenProps) {
  const [selected, setSelected] = useState(0);
  const [blink, setBlink] = useState(true);
  const { tw, dw, th } = useWidths();
  const host = useHostMonitor();

  // ── Responsive breakpoints ────────────────────────────────────────────────
  // Width tiers
  const narrow  = tw < 60;   // hide routing diagram, let zone dots wrap
  const vnarrow = tw < 40;   // hide zone labels, show dots only

  // Height tiers — each tier hides progressively more content
  const compact  = th < 26;  // hide routing diagram even if wide enough
  const short    = th < 20;  // hide directory + status section
  const minimal  = th < 14;  // hide everything except title + menu + hints

  const showDiagram  = !narrow && !compact;
  const showStatus   = !minimal;
  const showDir      = !short && !minimal;
  const showBusy     = busy && !minimal;

  // ── Self-contained keyboard handler ──────────────────────────────────────
  useInput((input, key) => {
    if (input === "q")                      { onQuit();     return; }
    if (key.upArrow   || input === "k")     { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j")     { setSelected((s) => Math.min(MENU.length - 1, s + 1)); return; }
    if (key.return || key.rightArrow) {
      if (selected === 0) onManage();
      else                onSettings();
      return;
    }
    if (input === "s") { onSettings(); return; }
  }, { isActive });

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 550);
    return () => clearInterval(id);
  }, []);

  const allLive      = proxyStatus === "running" && zones.every((z) => zoneStatuses[z.key] === "running");
  const anyUp        = proxyStatus === "running" || zones.some((z) => (zoneStatuses[z.key] ?? "missing") !== "missing");
  const runningCount = zones.filter((z) => zoneStatuses[z.key] === "running").length + (proxyStatus === "running" ? 1 : 0);
  const totalCount   = zones.length + 1;
  const healthRatio  = runningCount / totalCount;
  const statusColor  = allLive ? SUCCESS : anyUp ? WARNING : ERROR;
  const statusLabel  = allLive ? "● core is live" : anyUp ? "◑ starting" : "○ offline";

  const formatBytes = (bytes: number) => {
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={BRAND}
      paddingX={2}
      paddingY={minimal ? 0 : 1}
      width={tw}
      overflow="hidden"
    >
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <Box flexDirection="column" alignItems="center" marginBottom={minimal ? 0 : 1}>
        <Text bold color={BRAND}>{"◈   u n t · i n k"}</Text>
      </Box>

      {!minimal && (
        <Box justifyContent="center" marginBottom={0}>
          <Text color="gray">welcome to </Text>
          <Text bold color="white">{DOMAIN || "unenter.live"}</Text>
        </Box>
      )}

      {/* ── Active project directory ──────────────────────────────────────── */}
      {showDir && (
        <Box justifyContent="center" marginBottom={1}>
          <Text dimColor>⌂  </Text>
          <Text color="cyan">{PROJECT_DIR}</Text>
        </Box>
      )}

      {/* ── Status + Performance NOC ───────────────────────────────────────── */}
      {showStatus && (
        <Box flexDirection="column" alignItems="center" marginBottom={2}>
          <Box flexDirection={narrow ? "column" : "row"} gap={1} marginBottom={1}>
            <MetricCard 
              label="System CPU" 
              value={`${host.systemCpu.toFixed(1)}%`} 
              note="host load" 
              tone={host.systemCpu > 80 ? "error" : host.systemCpu > 50 ? "warning" : "success"}
              trend={sparkline(host.cpuHistory)}
            />
            <MetricCard 
              label="Host Memory" 
              value={formatBytes(host.usedMemory)} 
              note={`${formatBytes(host.freeMemory)} free`} 
              tone={host.memoryPressure > 0.9 ? "error" : host.memoryPressure > 0.7 ? "warning" : "success"}
              trend={sparkline(host.memHistory)}
            />
          </Box>

          <Box flexWrap="wrap" justifyContent="center" gap={1}>
            <Box gap={1}>
              <Text dimColor>prox</Text>
              <ContainerDot status={proxyStatus} />
            </Box>
            {zones.map((z) => (
              <Box key={z.key} gap={1} marginLeft={1}>
                {!vnarrow && <Text dimColor>{z.key}</Text>}
                <ContainerDot status={zoneStatuses[z.key] ?? "missing"} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Routing diagram — wide + tall terminals only ──────────────────── */}
      {showDiagram && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={2}
          paddingY={0}
          marginBottom={2}
          overflow="hidden"
        >
          <Box marginTop={0}>
            <Text dimColor>  how a request reaches your app</Text>
          </Box>
          <Text> </Text>

          <Box>
            <Text color="blue">  internet</Text>
            <Text color="gray"> ──▶ </Text>
            <Text bold color={BRAND_SEC}>◈ NPM</Text>
            <Text dimColor>
              {" · " + NPM_HOST.label + " · " + NPM_HOST.ip + ":" + NPM_HOST.port}
            </Text>
            <Text color={SUCCESS}>{"  · SSL ✓ · Let's Encrypt"}</Text>
          </Box>

          <Box>
            <Text dimColor>{"           "}</Text>
            <Text color="gray">{"      │"}</Text>
            <Text dimColor>{"  terminates TLS, forwards to stack"}</Text>
          </Box>

          <Box>
            <Text dimColor>{"           "}</Text>
            <Text color="gray">{"      ▼  "}</Text>
            <Text bold color={BRAND_SEC}>◈ proxy</Text>
            <Text dimColor>
              {" · " + STACK_HOST.label + " · :" + STACK_HOST.proxyPort}
            </Text>
            <Text color={WARNING}>{"  · Host-header routing"}</Text>
          </Box>

          {/* Zone tree — wraps for large zone counts */}
          <Box flexWrap="wrap" marginLeft={22}>
            {zones.map((z) => {
              const s = zoneStatuses[z.key] ?? "missing";
              return (
                <Box key={z.key} gap={1} marginRight={2}>
                  <ContainerDot status={s} />
                  <Text dimColor>{z.key}</Text>
                </Box>
              );
            })}
          </Box>

          <Text> </Text>
          <Box>
            <Text dimColor>
              {"  Next.js 15 multi-zone · independent deploys · shared domain"}
            </Text>
          </Box>
          <Text> </Text>
        </Box>
      )}

      {/* ── Menu ─────────────────────────────────────────────────────────── */}
      <Box flexDirection="column" gap={0} marginBottom={minimal ? 0 : 1}>
        {MENU.map((item, i) => {
          const active = selected === i;
          return (
            <Box key={item.label} paddingX={1} gap={2}>
              <Text color={active ? BRAND_SEC : INACTIVE}>
                {active ? (blink ? item.icon : " ") : " "}
              </Text>
              <Text bold={active} color={active ? BRAND_SEC : INACTIVE}>
                {item.label}
              </Text>
              {!narrow && (
                <Text dimColor>{item.desc}</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {!minimal && <Divider width={Math.max(4, dw)} />}

      {/* ── Background job banner ────────────────────────────────────────── */}
      {showBusy && (
        <Box justifyContent="center" gap={3} marginBottom={1}>
          <Text color="yellow">⚙  operation running in background</Text>
          <Text dimColor>[o] view output</Text>
        </Box>
      )}

      {/* ── Key hints ────────────────────────────────────────────────────── */}
      <KeyHints
        hints={[
          { k: "↑↓", label: "navigate" },
          { k: "↵",  label: "select"   },
          { k: "q",  label: "quit"     },
        ]}
        marginTop={0}
      />

    </Box>
  );
}
