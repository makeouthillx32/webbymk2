// src/ink/screens/WelcomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Splash / home screen.
//
// No auto-advance — waits for explicit input:
//   ↑ / ↓        navigate menu
//   Enter / →    select highlighted item
//   q            quit
//
// Menu items:
//   ▶  Manage     → zones / npm / db / infra dashboard
//   ⚙  Settings   → view & edit local config
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text }                  from "ink";
import type { Zone }                  from "../../config/zones.ts";
import { STACK_HOST, NPM_HOST, DOMAIN } from "../../config/stack.ts";
import { PROJECT_DIR }                from "../../config/zones.ts";
import { type Status }                from "../docker.ts";
import { ContainerDot }               from "../components/ContainerDot.tsx";
import { Divider }                    from "../components/Divider.tsx";
import { KeyHints }                   from "../components/KeyHint.tsx";
import { ProgressBar }                from "../components/design-system/ProgressBar.tsx";
import { useWidths }                  from "../hooks/useTermWidth.ts";

// ── Color palette (terminal-safe) ─────────────────────────────────────────────
const BRAND        = "#D4A27F";   // warm amber — unt.ink accent
const BRAND_SEC    = "cyan";      // cyan  — secondary accent / links
const SUCCESS      = "green";
const WARNING      = "yellow";
const ERROR        = "red";
const INACTIVE     = "gray";

type StatusMap = Record<string, Status>;

export interface WelcomeScreenProps {
  zones:        Zone[];
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
  /** 0 = Manage, 1 = Settings */
  selected:     number;
  /** True while a background operation (build, deploy, etc.) is running */
  busy?:        boolean;
}

const MENU = [
  { icon: "▶", label: "Manage",   desc: "zones · npm · db · infrastructure" },
  { icon: "⚙", label: "Settings", desc: "view & edit local config"           },
];

export function WelcomeScreen({ zones, zoneStatuses, proxyStatus, selected, busy }: WelcomeScreenProps) {
  const [blink, setBlink] = useState(true);
  const { tw, dw } = useWidths();
  const narrow = tw < 60;  // collapse the routing diagram on narrow terminals

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 550);
    return () => clearInterval(id);
  }, []);

  const allLive     = proxyStatus === "running" && zones.every((z) => zoneStatuses[z.key] === "running");
  const anyUp       = proxyStatus === "running" || zones.some((z) => (zoneStatuses[z.key] ?? "missing") !== "missing");
  const runningCount = zones.filter((z) => zoneStatuses[z.key] === "running").length + (proxyStatus === "running" ? 1 : 0);
  const totalCount   = zones.length + 1; // +1 for proxy
  const healthRatio  = runningCount / totalCount;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={BRAND}
      paddingX={2}
      paddingY={1}
      width={tw}
    >
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold color={BRAND}>{"◈   u n t · i n k"}</Text>
      </Box>
      <Box justifyContent="center" marginBottom={0}>
        <Text color="gray">welcome to </Text>
        <Text bold color="white">{DOMAIN || "unenter.live"}</Text>
      </Box>

      {/* ── Active project directory ──────────────────────────────────────────── */}
      <Box justifyContent="center" marginBottom={1}>
        <Text dimColor>⌂  </Text>
        <Text color="cyan">{PROJECT_DIR}</Text>
      </Box>

      {/* ── Core live/offline status ──────────────────────────────────────────── */}
      <Box justifyContent="center" gap={2} marginBottom={1}>
        <Text color={allLive ? SUCCESS : anyUp ? WARNING : ERROR}>
          {allLive ? "● core is live" : anyUp ? "◑ starting" : "○ offline"}
        </Text>
        <Text dimColor>|</Text>
        <Box gap={1}>
          <Text dimColor>proxy</Text>
          <ContainerDot status={proxyStatus} />
        </Box>
        {zones.map((z) => (
          <Box key={z.key} gap={1}>
            <Text dimColor>{z.key}</Text>
            <ContainerDot status={zoneStatuses[z.key] ?? "missing"} />
          </Box>
        ))}
      </Box>

      {/* ── Health progress bar ───────────────────────────────────────────────── */}
      <Box justifyContent="center" gap={2} marginBottom={2}>
        <ProgressBar
          ratio={healthRatio}
          width={Math.max(20, dw - 10)}
          fillColor={allLive ? SUCCESS : anyUp ? WARNING : ERROR}
        />
        <Text dimColor>{runningCount}/{totalCount}</Text>
      </Box>

      {/* ── Routing chain — hidden on narrow terminals ────────────────────────── */}
      {!narrow && <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={2}
        paddingY={0}
        marginBottom={2}
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

        <Box>
          <Text dimColor>{"           "}</Text>
          <Text color="gray">{"      ┌──"}</Text>
          {zones.map((z, i) => (
            <Text key={z.key} color="gray">
              {i < zones.length - 1 ? "──────┬" : "──────┐"}
            </Text>
          ))}
        </Box>

        <Box>
          <Text dimColor>{"           "}</Text>
          <Text color="gray">{"      ▼   "}</Text>
          {zones.map((z, i) => {
            const s = zoneStatuses[z.key] ?? "missing";
            return (
              <Box key={z.key}>
                <ContainerDot status={s} />
                <Text dimColor>
                  {" " + z.key + (i < zones.length - 1 ? "     " : "")}
                </Text>
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
      </Box>}

      {/* ── Menu ──────────────────────────────────────────────────────────────── */}
      <Box flexDirection="column" gap={0} marginBottom={1}>
        {MENU.map((item, i) => {
          const active = selected === i;
          return (
            <Box key={item.label} paddingX={2} gap={2}>
              <Text color={active ? BRAND_SEC : INACTIVE}>
                {active ? (blink ? item.icon : " ") : " "}
              </Text>
              <Text bold={active} color={active ? BRAND_SEC : INACTIVE}>
                {item.label}
              </Text>
              <Text dimColor>{item.desc}</Text>
            </Box>
          );
        })}
      </Box>

      <Divider width={dw} />

      {/* ── Background job banner ─────────────────────────────────────────────── */}
      {busy && (
        <Box justifyContent="center" gap={3} marginBottom={1}>
          <Text color="yellow">⚙  operation running in background</Text>
          <Text dimColor>[o] view output</Text>
        </Box>
      )}

      {/* ── Key hints ─────────────────────────────────────────────────────────── */}
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
