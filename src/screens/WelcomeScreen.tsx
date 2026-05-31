/** @jsxRuntime classic */
// src/ink/screens/WelcomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Splash / home screen — fully responsive to any terminal size.
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
import { MetricCard } from "../ink/components/design-system/MetricCard.jsx";
import { sparkline } from "../ink/utils/sparkline.js";

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

const MENU_DEV = [
  { icon: "⚡", label: "Release", desc: "build + bump + publish to npm", action: "release" },
  { icon: "⬡", label: "Build", desc: "local build only (no publish)", action: "build" },
] as const;

type MenuAction = "manage" | "settings" | "release" | "build";

const isDev = process.env.NODE_ENV !== "production";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WelcomeScreenProps {
  zones: Zone[];
  zoneStatuses: StatusMap;
  proxyStatus: Status;
  busy?: boolean;
  onManage: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onRelease?: () => void;
  onBuild?: () => void;
  isActive: boolean;
}

export function WelcomeScreen({
  zones, zoneStatuses, proxyStatus, busy,
  onManage, onSettings, onQuit, onRelease, onBuild, isActive,
}: WelcomeScreenProps) {
  const MENU = isDev ? [...MENU_BASE, ...MENU_DEV] : [...MENU_BASE];

  const [selected, setSelected] = useState(0);
  const [blink, setBlink] = useState(true);
  const { tw, dw, th } = useWidths();
  const host = useHostMonitor();

  const devUpdateCheckVersion = process.env.UNAXIS_UPDATE_CHECK_VERSION?.trim();
  const currentVersion =
    typeof UNAXIS_VERSION !== "undefined"
      ? UNAXIS_VERSION
      : devUpdateCheckVersion || "dev";
  const { updateAvailable, latestVersion, isChecking } = useUpdateCheck(currentVersion);

  // ── Responsive breakpoints ────────────────────────────────────────────────
  const narrow = tw < 60;
  const vnarrow = tw < 40;
  const compact = th < 26;
  const short = th < 20;
  const minimal = th < 14;

  const showDiagram = !narrow && !compact;
  const showStatus = !minimal;
  const showDir = !short && !minimal;
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
      if (action === "release") { onRelease?.(); return; }
      if (action === "build") { onBuild?.(); return; }
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
    // Dev-only hotkeys
    if (isDev && input === "r") { onRelease?.(); return; }
    if (isDev && input === "b") { onBuild?.(); return; }
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
      paddingY={minimal ? 0 : 1}
      width={tw}
      overflow="hidden"
    >
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <Box flexDirection="column" alignItems="center" marginBottom={minimal ? 0 : 1}>
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
          <Text color="gray">welcome to </Text>
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
      <Box flexDirection="column" gap={0} marginBottom={minimal ? 0 : 1}>
        {MENU_BASE.map((item, i) => {
          const active = selected === i;
          return (
            <Box key={item.label} paddingX={1} gap={2}>
              <Text color={active ? BRAND_SEC : INACTIVE}>
                {active ? (blink ? item.icon : " ") : " "}
              </Text>
              <Text bold={active} color={active ? BRAND_SEC : INACTIVE}>{item.label}</Text>
              {!narrow && <Text dimColor>{item.desc}</Text>}
            </Box>
          );
        })}

        {/* Dev-only section — dead code in prod bundle */}
        {isDev && (
          <>
            <Box paddingX={1} marginTop={0}>
              <Text dimColor>{"  ─── dev ──────────────────────────"}</Text>
            </Box>
            {MENU_DEV.map((item, i) => {
              const idx = MENU_BASE.length + i;
              const active = selected === idx;
              return (
                <Box key={item.label} paddingX={1} gap={2}>
                  <Text color={active ? DEV_COLOR : INACTIVE}>
                    {active ? (blink ? item.icon : " ") : " "}
                  </Text>
                  <Text bold={active} color={active ? DEV_COLOR : INACTIVE}>{item.label}</Text>
                  {!narrow && <Text dimColor>{item.desc}</Text>}
                </Box>
              );
            })}
          </>
        )}
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
