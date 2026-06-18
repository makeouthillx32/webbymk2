/** @jsxRuntime classic */
// src/ink/screens/WelcomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Project welcome screen — fully responsive to any terminal size.
//
// Adaptive layout tiers (checked in order — first match wins):
//
//   tw  >= 60 AND th >= 24   ->  full:    routing diagram + all sections
//   tw  >= 60               ->  no-diagram: diagram hidden, rest visible
//   tw  < 60               ->  narrow: diagram hidden, zones wrap to rows
//   th  < 16               ->  compact: hide status section entirely
//   th  < 10               ->  minimal: title + menu + hints only
//
// DEV MODE extras (process.env.NODE_ENV !== "production"):
//   Extra menu items + hotkeys appear below the standard menu.
//   Dead code in the production bundle (NODE_ENV define eliminates them).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "../ink/reactRuntime.js";
import { Box, Text, useInput } from "../ink/runtimeInk.js";
import type { Zone } from "../config/zones.js";
import { STACK_HOST, NPM_HOST, DOMAIN } from "../config/stack.js";
import { PROJECT_DIR } from "../config/zones.js";
import { type Status } from "../ink/docker.js";
import { ContainerDot } from "../ink/components/ContainerDot.jsx";
import { Divider } from "../ink/components/Divider.jsx";
import { KeyHints } from "../ink/components/KeyHint.jsx";
import { useWidths } from "../ink/hooks/useTermWidth.js";
import { useHostMonitor } from "../ink/hooks/useHostMonitor.js";
import { useUpdateCheck } from "../ink/hooks/useUpdateCheck.js";
import { useHealthSummary } from "../ink/hooks/useHealthSummary.js";
import { MetricCard } from "../ink/components/design-system/MetricCard.jsx";
import { sparkline } from "../ink/utils/sparkline.js";
import type { ServiceResult } from "../ink/infra.js";


declare const UNAXIS_VERSION: string | undefined;

// ── Color palette (terminal-safe) ─────────────────────────────────────────────
const BRAND = "#D4A27F";
const BRAND_SEC = "cyan";
const SUCCESS = "green";
const WARNING = "yellow";
const INACTIVE = "gray";
const DEV_COLOR = "magenta";

type StatusMap = Record<string, Status>;

// ── Menu definitions ──────────────────────────────────────────────────────────

const MENU_BASE = [
  { icon: "▶", label: "Manage", desc: "overview · zones · npm · db · infra", action: "manage" },
  { icon: "⚙", label: "Settings", desc: "view & edit local config", action: "settings" },
] as const;

// Release + Build moved to StartupScreen (picker phase, [R] in dev/bun mode).

type MenuAction = "manage" | "settings";

const isDev = process.env.NODE_ENV !== "production";

// ── Health Bar ────────────────────────────────────────────────────────────────

interface HealthBarProps {
  health: ReturnType<typeof useHealthSummary>;
  narrow: boolean;
}

function HealthBar({ health, narrow }: HealthBarProps) {
  const { servicesDown, dbDegraded, dbStopped, sslExpired, sslExpiringSoon, sslLoading } = health

  // All clear — show a single green line
  const allClear =
    servicesDown === 0 &&
    dbDegraded   === 0 &&
    dbStopped    === 0 &&
    sslExpired   === 0 &&
    sslExpiringSoon === 0

  if (allClear && !sslLoading) {
    return (
      <Box justifyContent="center" marginBottom={1}>
        <Text color="green">{"✓ "}</Text>
        <Text dimColor>{"all systems nominal"}</Text>
      </Box>
    )
  }

  // Build chips: only show non-zero counts, or SSL while still loading
  const chips: Array<{ label: string; color: string }> = []

  if (servicesDown > 0)
    chips.push({ label: `${servicesDown} service${servicesDown > 1 ? "s" : ""} down`, color: "red" })

  if (dbDegraded > 0)
    chips.push({ label: `${dbDegraded} DB degraded`, color: "yellow" })

  if (dbStopped > 0)
    chips.push({ label: `${dbStopped} DB stopped`, color: "gray" })

  if (sslExpired > 0)
    chips.push({ label: `${sslExpired} SSL expired`, color: "red" })

  if (sslExpiringSoon > 0)
    chips.push({ label: `${sslExpiringSoon} SSL expiring`, color: "yellow" })

  if (chips.length === 0 && sslLoading) {
    // Infra/DB clear but SSL still loading — don't flash a false "all clear"
    return null
  }

  const sep = narrow ? "\n" : "  ·  "

  return (
    <Box justifyContent="center" marginBottom={1} flexWrap="wrap">
      <Text color="yellow">{"⚠  "}</Text>
      {chips.map((chip, i) => (
        <Box key={chip.label}>
          <Text bold color={chip.color}>{chip.label}</Text>
          {i < chips.length - 1 && <Text dimColor>{sep}</Text>}
        </Box>
      ))}
    </Box>
  )
}

// ── Menu Item Component ───────────────────────────────────────────────────────

interface WelcomeMenuItemProps {
  item: typeof MENU_BASE[number];
  active: boolean;
  narrow: boolean;
  blink: boolean;
  color: string;
}

function WelcomeMenuItem({ item, active, narrow, blink, color }: WelcomeMenuItemProps) {
  return (
    <Box paddingX={1} gap={2}>
      <Text color={active ? color : INACTIVE}>
        {active ? (blink ? item.icon : " ") : " "}
      </Text>
      <Text bold={active} color={active ? color : INACTIVE}>{item.label}</Text>
      {!narrow && <Text dimColor>{item.desc}</Text>}
    </Box>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WelcomeScreenProps {
  zones: Zone[];
  zoneStatuses: StatusMap;
  proxyStatus: Status;
  busy?: boolean;
  /** Infra check results from useEnvManager — used to populate the health bar */
  infraResults?: Record<string, ServiceResult>;
  onManage: () => void;
  onSettings: () => void;
  onQuit: () => void;
  isActive: boolean;
}

export function WelcomeScreen({
  zones, zoneStatuses, proxyStatus, busy,
  infraResults = {},
  onManage, onSettings, onQuit, isActive,
}: WelcomeScreenProps) {
  const MENU = [...MENU_BASE];

  const [selected, setSelected] = useState(0);
  const [blink, setBlink] = useState(true);

  const { tw, dw, th } = useWidths();
  const host   = useHostMonitor();
  const health = useHealthSummary(infraResults);

  const devUpdateCheckVersion = process.env.UNAXIS_UPDATE_CHECK_VERSION?.trim();
  const currentVersion =
    typeof UNAXIS_VERSION !== "undefined"
      ? UNAXIS_VERSION
      : devUpdateCheckVersion || "dev";
  const { updateAvailable, latestVersion, isChecking } = useUpdateCheck(currentVersion);

  // ── Responsive breakpoints ────────────────────────────────────────────────
  const narrow = tw < 60;
  const vnarrow = tw < 40;
  const compact = th < 25;
  const short = th < 22;
  const minimal = th < 14;

  const showDiagram = th >= 36 && !narrow;
  const showStatus = th >= 22 && !minimal;
  const showDir = th >= 24 && !minimal;
  const showBusy = busy && !minimal;

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useInput((input, key) => {
    if (input === "q") { onQuit(); return; }
    if (key.upArrow || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") { setSelected((s) => Math.min(MENU.length - 1, s + 1)); return; }
    if (key.return || key.rightArrow) {
      const action = MENU[selected]?.action as MenuAction;
      if (action === "manage") { onManage(); return; }
      if (action === "settings") { onSettings(); return; }
      return;
    }
    if (input === "s") { onSettings(); return; }
    if (input === "u" && updateAvailable) {
      process.stdout.write(
        "\n  Update available: v" + latestVersion + "\n" +
        "  Run:  npm update -g @untsystems/unaxis\n\n"
      );
      return;
    }
  }, { isActive });

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 550);
    return () => clearInterval(id);
  }, []);

  const allLive = proxyStatus === "running" && zones.every((z) => zoneStatuses[z.key] === "running");
  const anyUp = proxyStatus === "running" || zones.some((z) => (zoneStatuses[z.key] ?? "missing") !== "missing");

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
      borderColor={isDev ? DEV_COLOR : BRAND}
      paddingX={2}
      paddingY={th < 25 ? 0 : 1}
      width={tw}
      overflow="hidden"
    >
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <Box flexDirection="column" alignItems="center" marginBottom={th < 25 ? 0 : 1}>
        <Box gap={2} alignItems="center">
          <Text bold color={BRAND}>{"◈  UNAXIS"}</Text>
          {typeof UNAXIS_VERSION !== "undefined" && (
            <Text dimColor color={BRAND}>v{UNAXIS_VERSION}</Text>
          )}
          {isDev && <Text bold color={DEV_COLOR}> DEV </Text>}
        </Box>
      </Box>

      {/* ── Update banner ──────────────────────────────────────────────────── */}
      {updateAvailable && !minimal && (
        <Box justifyContent="center" marginBottom={0}>
          <Text color="yellow">{"⬆  update available: v"}</Text>
          <Text bold color="yellow">{latestVersion}</Text>
          <Text dimColor>{"  [u] to see instructions"}</Text>
        </Box>
      )}
      {isChecking && !updateAvailable && !minimal && (
        <Box justifyContent="center" marginBottom={0}>
          <Text dimColor>{"checking for updates…"}</Text>
        </Box>
      )}

      {!minimal && (
        <Box justifyContent="center" marginBottom={0}>
          <Text color="gray">project welcome: </Text>
          <Text bold color="white">{DOMAIN || "unenter.live"}</Text>
        </Box>
      )}

      {/* ── Project directory ─────────────────────────────────────────────── */}
      {showDir && (
        <Box justifyContent="center" marginBottom={1}>
          <Text dimColor>{"⌂  "}</Text>
          <Text color="cyan">{PROJECT_DIR}</Text>
        </Box>
      )}

      {/* ── Health bar ────────────────────────────────────────────────────── */}
      {!minimal && (
        <HealthBar health={health} narrow={narrow} />
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
            <Text dimColor>{"  how a request reaches your app"}</Text>
          </Box>
          <Text> </Text>
          <Box>
            <Text color="blue">{"  internet"}</Text>
            <Text color="gray">{" ──▶ "}</Text>
            <Text bold color={BRAND_SEC}>{"◈ NPM"}</Text>
            <Text dimColor>{" · " + NPM_HOST.label + " · " + NPM_HOST.ip + ":" + NPM_HOST.port}</Text>
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
            <Text bold color={BRAND_SEC}>{"◈ proxy"}</Text>
            <Text dimColor>{" · " + STACK_HOST.label + " · :" + STACK_HOST.proxyPort}</Text>
            <Text color={WARNING}>{"  · Host-header routing"}</Text>
          </Box>
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
            <Text dimColor>{"  Next.js 15 multi-zone · independent deploys · shared domain"}</Text>
          </Box>
          <Text> </Text>
        </Box>
      )}

      {/* ── Menu ─────────────────────────────────────────────────────────── */}
      <Box flexDirection="column" gap={0} marginBottom={th < 25 ? 0 : 1}>
        {MENU_BASE.map((item, i) => (
          <WelcomeMenuItem
            key={item.label}
            item={item}
            active={selected === i}
            narrow={narrow}
            blink={blink}
            color={BRAND_SEC}
          />
        ))}

      </Box>

      {!minimal && <Divider width={Math.max(4, dw)} />}

      {/* ── Background job banner ────────────────────────────────────────── */}
      {showBusy && (
        <Box justifyContent="center" gap={3} marginBottom={1}>
          <Text color="yellow">{"⚙  operation running in background"}</Text>
          <Text dimColor>{"[o] view output"}</Text>
        </Box>
      )}

      {/* ── Key hints ────────────────────────────────────────────────────── */}
      <KeyHints
        hints={[
          { k: "↑↓", label: "navigate" },
          { k: "↵", label: "select" },
          { k: "q", label: "quit" },
          ...(updateAvailable ? [{ k: "u", label: "update" }] : []),
          ...(isDev ? [
            { k: "r", label: "release" },
            { k: "b", label: "build" },
          ] : []),
        ]}
        marginTop={0}
      />

    </Box>
  );
}
