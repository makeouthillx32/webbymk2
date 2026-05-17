// src/ink/views/CoreView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The "core" tab — permanent infrastructure that is NOT a zone.
//
//   App     (unt_app)   — the core Next.js monolith at unenter.live
//   Proxy   (unt_proxy) — the custom multi-zone reverse proxy
//
// Actions differ from zones:
//   App   → deploy / pull+up / restart / build / rebuild / logs
//   Proxy → restart / rebuild / logs / sync routes
//
// Neither can be deleted or NPM-registered from here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useInput }          from "ink";
import { useActionNav }                 from "../hooks/useActionNav.ts";

import type { Zone }   from "../../config/zones.ts";
import type { Status } from "../docker.ts";

import { StatusBadge }   from "../components/StatusBadge.tsx";
import { KeyHints }      from "../components/KeyHint.tsx";
import { ActionPanel, buildCoreActions, isCoreZone } from "../panels/Action/index.tsx";
import type { Action }   from "../panels/Action/index.tsx";

import { restartZone, pullAndUp, reloadProxy } from "../docker.ts";
import { buildZone, deployZone }               from "../zone-build.ts";

import { useHostMonitor }      from "../hooks/useHostMonitor.ts";
import { sparkline }           from "../utils/sparkline.ts";
import { MetricCard }          from "../components/design-system/MetricCard.tsx";
import { SectionFrame }        from "../components/design-system/SectionFrame.tsx";
import { Divider }             from "../components/Divider.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;

interface CoreViewProps {
  zones:           Zone[];
  zoneStatuses:    StatusMap;
  proxyStatus:     Status;
  runOp:           (title: string, op: (o: (l: string) => void) => Promise<number>) => void;
  openLogs:        (zone: Zone) => void;
  /** Start dev container, stream logs, stop+cleanup on dismiss. */
  runDevMode:      (zone: Zone) => void;
  addNotification: (msg: string, type?: "success" | "error" | "info") => void;
  onGoBack:        () => void;
  isActive:        boolean;
  /** Called once on mount — used to force-refresh zone definitions from DB */
  onEnter?:        () => void;
}

// ── Proxy pseudo-zone (not in DB — constructed locally) ───────────────────────

const PROXY_ZONE: Zone = {
  key:            "proxy",
  label:          "Proxy",
  domain:         "unt_proxy  ·  :3080",
  service:        "proxy",
  container:      "unt_proxy",
  image:          "",
  dockerfile:     "proxy/Dockerfile",
  upstreamEnvKey: "UPSTREAM_PROXY",
};

const PROXY_ACTIONS: Action[] = [
  { id: "restart", label: "Restart",            desc: "docker compose restart",              key: "r", disabled: false },
  { id: "rebuild", label: "Rebuild (no cache)", desc: "rebuild proxy image (no cache)",      key: "R", disabled: false },
  { id: "logs",    label: "Logs",               desc: "tail -f proxy container output",      key: "l", disabled: false },
];

// ── CoreView ──────────────────────────────────────────────────────────────────

export function CoreView({
  zones, zoneStatuses, proxyStatus,
  runOp, openLogs, runDevMode, addNotification,
  onGoBack, isActive, onEnter,
}: CoreViewProps) {

  // Force-refresh zone definitions the moment this view is entered so any
  // DB changes (e.g. dockerfile field updates) are always immediately visible.
  useEffect(() => { onEnter?.(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const coreApp = zones.find(isCoreZone) ?? null;
  const host = useHostMonitor();

  // Rows: 0 = App, 1 = Proxy
  const [selected,   setSelected]   = useState(0);
  const [actionOpen, setActionOpen] = useState(false);

  const activeZone    = selected === 0 ? coreApp : PROXY_ZONE;
  const activeActions = useMemo(
    () => selected === 0
      ? (coreApp ? buildCoreActions(coreApp) : [])
      : PROXY_ACTIONS,
    [selected, coreApp],
  );
  const actionNav = useActionNav(activeActions);

  // ── Action executor ──────────────────────────────────────────────────────
  const executeAction = useCallback((actionId: string, zone: Zone) => {
    switch (actionId) {
      case "deploy":
        runOp(`Deploy  ${zone.label}`, (o) => deployZone(zone, o));
        break;
      case "pull":
        runOp(`Pull+up  ${zone.label}`, (o) => pullAndUp(zone, o));
        break;
      case "restart":
        if (zone.key === "proxy") {
          runOp("Restart proxy", (o) => reloadProxy(o));
        } else {
          runOp(`Restart  ${zone.label}`, (o) => restartZone(zone, o));
        }
        break;
      case "build":
        runOp(`Build + Deploy  ${zone.label}`, async (o) => {
          if (!zone.dockerfile) { o("No Dockerfile"); return 1; }
          const code = await buildZone(zone, o);
          if (code !== 0) return code;
          o("--- pull + up ---");
          return pullAndUp(zone, o);
        });
        break;
      case "rebuild":
        if (zone.key === "proxy") {
          runOp("Rebuild proxy  (no cache)", (o) => reloadProxy(o));
        } else {
          runOp(`Rebuild + Deploy  ${zone.label}  (no cache)`, async (o) => {
            if (!zone.dockerfile) { o("No Dockerfile"); return 1; }
            const code = await buildZone(zone, o, { noCache: true });
            if (code !== 0) return code;
            o("--- pull + up ---");
            return pullAndUp(zone, o);
          });
        }
        break;
      case "logs":
        openLogs(zone);
        break;
      case "dev":
        runDevMode(zone);
        break;
    }
    setActionOpen(false);
  }, [runOp, openLogs]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useInput((input, key) => {

    if (actionOpen) {
      if (key.escape || input === "q") { setActionOpen(false); return; }

      if (key.upArrow   || input === "k") { actionNav.moveUp();   return; }
      if (key.downArrow || input === "j") { actionNav.moveDown(); return; }

      if (key.return) {
        const action = activeActions[actionNav.selected];
        if (!action || action.disabled || !activeZone) return;
        executeAction(action.id, activeZone);
        return;
      }
      const matched = activeActions.find((a) => !a.disabled && a.key === input);
      if (matched && activeZone) { executeAction(matched.id, activeZone); return; }
      return;
    }

    if (key.upArrow   || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") { setSelected((s) => Math.min(1, s + 1)); return; }

    if (key.return) {
      if (!activeZone) return;
      const firstEnabledIdx = activeActions.findIndex((a) => !a.disabled);
      actionNav.reset(firstEnabledIdx >= 0 ? firstEnabledIdx : 0);
      setActionOpen(true);
      return;
    }

    if (input === "l") { if (activeZone) openLogs(activeZone); return; }
    if (input === "q" || key.escape) { onGoBack(); return; }

  }, { isActive });

  const formatBytes = (bytes: number) => {
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (actionOpen && activeZone) {
    return (
      <ActionPanel
        zone={activeZone}
        status={selected === 1 ? proxyStatus : (zoneStatuses[activeZone.key] ?? "missing")}
        selected={actionNav.selected}
      />
    );
  }

  const appStatus   = coreApp ? (zoneStatuses[coreApp.key] ?? "missing") : "missing";

  return (
    <Box flexDirection="column" gap={1}>
      
      {/* Performance NOC */}
      <Box gap={1} marginBottom={1}>
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

      <SectionFrame title="Platform Core" tone="suggestion">
        <Box flexDirection="column">
          {/* ── App row ─────────────────────────────────────────────────────── */}
          <Box paddingX={1} gap={2}>
            <Text color={selected === 0 ? "cyan" : undefined} bold={selected === 0}>
              {selected === 0 ? "▶" : " "}
            </Text>
            <Box width={18}>
              <Text color={selected === 0 ? "cyan" : undefined} bold={selected === 0}>
                {coreApp?.label ?? "App"}
              </Text>
            </Box>
            <Box width={28}>
              <Text dimColor={selected !== 0}>{coreApp?.domain ?? "unenter.live"}</Text>
            </Box>
            <StatusBadge status={appStatus} />
          </Box>

          {/* ── Proxy row ───────────────────────────────────────────────────── */}
          <Box paddingX={1} gap={2}>
            <Text color={selected === 1 ? "cyan" : undefined} bold={selected === 1}>
              {selected === 1 ? "▶" : " "}
            </Text>
            <Box width={18}>
              <Text color={selected === 1 ? "cyan" : undefined} bold={selected === 1}>
                Proxy
              </Text>
            </Box>
            <Box width={28}>
              <Text dimColor={selected !== 1}>unt_proxy  ·  :3080</Text>
            </Box>
            <StatusBadge status={proxyStatus} />
          </Box>
        </Box>
      </SectionFrame>

      <KeyHints hints={[
        { k: "↑↓", label: "navigate" },
        { k: "↵",  label: "actions"  },
        { k: "l",  label: "logs"     },
      ]} />

    </Box>
  );
}
