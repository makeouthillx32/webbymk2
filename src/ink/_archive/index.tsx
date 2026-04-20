// tui/index.tsx — unt.ink entry point
// ─────────────────────────────────────────────────────────────────────────────
// App shell with screen state machine:
//
//   welcome  ──(anyKey / 3s)──▶  zones  ──(Enter)──▶  action overlay
//                                  │                       │
//                              (Tab)──▶ db / infra    (Esc)──▶ zones
//
// Operations (build, deploy, git push, logs) run in OperationOverlay,
// which captures the keyboard until q/Esc dismisses it.
//
// Dev:    bun index.tsx             (from tui/)
// Build:  bun build.ts              (→ dist/cli.js)
// Run:    node .\tui\dist\cli.js    (from project root)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { ChildProcess }                                from "child_process";
import { render, Box, Text, useInput, useApp }              from "ink";

import { ZONES }                                            from "../config/zones.ts";
import {
  pollAll, restartZone, pullAndUp, reloadProxy, spawnLogTail,
  type Status,
}                                                           from "./docker.ts";
import { buildZone, buildAll, deployZone, gitPush }         from "./zone-build.ts";
import { npmAddZone }                                       from "./npm-api.ts";
import { drainStream }                                      from "./utils.ts";
import { INFRA_SERVICES, checkService }                     from "./infra.ts";
import type { ServiceResult }                               from "./infra.ts";

import { WelcomeScreen }                                    from "./screens/WelcomeScreen.tsx";
import { DashboardScreen }                                  from "./screens/DashboardScreen.tsx";
import { ActionMenu, buildActions, firstEnabled }           from "./screens/ActionMenu.tsx";
import { OperationOverlay, type OpView }                   from "./OperationOverlay.tsx";
import { DbTab }                                            from "./tabs/DbTab.tsx";
import { InfraTab, type InfraView }                        from "./tabs/InfraTab.tsx";
import { Rule }                                             from "./ui/primitives.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Top-level view — which screen is visible */
type View = "welcome" | "zones" | "db" | "infra";

type StatusMap = Record<string, Status>;
type InfraMap  = Record<number, ServiceResult>;

const VIEW_CYCLE: View[] = ["zones", "db", "infra"];

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ view }: { view: View }) {
  const viewLabel = view === "welcome" ? "" : view;
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Box gap={2}>
        <Text bold color="cyan">unt.ink</Text>
        <Text dimColor>·</Text>
        <Text color="gray">unenter infrastructure manager</Text>
        {viewLabel && (
          <>
            <Text dimColor>·</Text>
            <Text color="cyan">{viewLabel}</Text>
          </>
        )}
      </Box>
      <Text dimColor>
        {new Date().toLocaleTimeString("en-US", { hour12: false })}
      </Text>
    </Box>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();

  // ── Screen state ──────────────────────────────────────────────────────────
  const [view,        setView]        = useState<View>("welcome");
  const [countdown,   setCountdown]   = useState(3);

  // ── Operation overlay ─────────────────────────────────────────────────────
  const [opOverlay,   setOpOverlay]   = useState<OpView | null>(null);
  const [opTitle,     setOpTitle]     = useState("");
  const [opLines,     setOpLines]     = useState<string[]>([]);
  const [busy,        setBusy]        = useState(false);
  const logProcRef                    = useRef<ChildProcess | null>(null);

  // ── Action menu state ─────────────────────────────────────────────────────
  const [actionOpen,    setActionOpen]    = useState(false);
  const [actionSelected, setActionSelected] = useState(0);

  // ── Zones state ───────────────────────────────────────────────────────────
  const [zoneSelected,  setZoneSelected]  = useState(0);
  const [zoneStatuses,  setZoneStatuses]  = useState<StatusMap>({});
  const [proxyStatus,   setProxyStatus]   = useState<Status>("missing");

  // ── Infra state ───────────────────────────────────────────────────────────
  const [infraView,     setInfraView]     = useState<InfraView>("hosts");
  const [infraSelected, setInfraSelected] = useState(0);
  const [infraResults,  setInfraResults]  = useState<InfraMap>({});
  const [infraChecking, setInfraChecking] = useState(false);

  // ── Welcome countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "welcome") return;
    if (countdown <= 0) { setView("zones"); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [view, countdown]);

  // ── Zone polling (every 5 s) ──────────────────────────────────────────────
  const refreshZones = useCallback(async () => {
    const { zoneStatuses: zs, proxyStatus: ps } = await pollAll(ZONES);
    setZoneStatuses(zs);
    setProxyStatus(ps);
  }, []);

  useEffect(() => {
    refreshZones();
    const id = setInterval(refreshZones, 5_000);
    return () => clearInterval(id);
  }, [refreshZones]);

  // ── Infra checks ──────────────────────────────────────────────────────────
  const checkInfra = useCallback(async (indices?: number[]) => {
    if (infraChecking) return;
    const targets = indices ?? INFRA_SERVICES.map((_, i) => i);
    setInfraChecking(true);
    setInfraResults((prev) => {
      const next = { ...prev };
      for (const i of targets) next[i] = { status: "checking", ms: null, code: null };
      return next;
    });
    await Promise.all(
      targets.map(async (i) => {
        const r = await checkService(INFRA_SERVICES[i]);
        setInfraResults((prev) => ({ ...prev, [i]: r }));
      })
    );
    setInfraChecking(false);
  }, [infraChecking]);

  const infraInitRef = useRef(false);
  useEffect(() => {
    if (view === "infra" && !infraInitRef.current) {
      infraInitRef.current = true;
      checkInfra();
    }
  }, [view, checkInfra]);

  // ── Streaming operation runner ────────────────────────────────────────────
  const runOp = useCallback(
    (title: string, op: (onLine: (l: string) => void) => Promise<number>) => {
      if (busy) return;
      setBusy(true);
      setOpLines([]);
      setOpTitle(title);
      setOpOverlay("output");
      setActionOpen(false);
      const add = (l: string) => setOpLines((prev) => [...prev.slice(-200), l]);
      op(add).then((code) => {
        add(code === 0 ? "✓ done" : `✗ exit ${code}`);
        setBusy(false);
        refreshZones();
      });
    },
    [busy, refreshZones]
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useInput((input, key) => {

    // ── Operation overlay: only q/esc closes ────────────────────────────────
    if (opOverlay) {
      if (key.escape || input === "q") {
        if (opOverlay === "logs") {
          logProcRef.current?.kill();
          logProcRef.current = null;
        }
        setOpOverlay(null);
      }
      return;
    }

    // ── Welcome screen: any key advances ────────────────────────────────────
    if (view === "welcome") {
      setView("zones");
      return;
    }

    // ── Global: q quits ─────────────────────────────────────────────────────
    if (input === "q" && !actionOpen) { exit(); return; }

    // ── Tab cycles main views ────────────────────────────────────────────────
    if (key.tab && !actionOpen) {
      const idx = VIEW_CYCLE.indexOf(view as typeof VIEW_CYCLE[number]);
      const next = VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length];
      setView(next);
      setActionOpen(false);
      return;
    }

    // ── Action menu overlay ──────────────────────────────────────────────────
    if (actionOpen && view === "zones") {
      const zone    = ZONES[zoneSelected];
      const actions = buildActions(zone);

      if (key.escape || input === "q") { setActionOpen(false); return; }

      if (key.upArrow || input === "k") {
        setActionSelected((s) => {
          let next = s - 1;
          while (next >= 0 && actions[next].disabled) next--;
          return next >= 0 ? next : s;
        });
        return;
      }
      if (key.downArrow || input === "j") {
        setActionSelected((s) => {
          let next = s + 1;
          while (next < actions.length && actions[next].disabled) next++;
          return next < actions.length ? next : s;
        });
        return;
      }

      if (key.return) {
        const action = actions[actionSelected];
        if (!action || action.disabled) return;
        executeAction(action.id, zone);
        return;
      }

      // Also support direct key shortcuts inside action menu
      const matched = actions.find((a) => !a.disabled && a.key === input);
      if (matched) { executeAction(matched.id, zone); return; }

      return;
    }

    // ── Zones view ───────────────────────────────────────────────────────────
    if (view === "zones") {
      if (key.upArrow   || input === "k") {
        setZoneSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setZoneSelected((s) => Math.min(ZONES.length - 1, s + 1));
        return;
      }

      // Enter → open action menu for selected zone
      if (key.return) {
        const zone = ZONES[zoneSelected];
        setActionSelected(firstEnabled(zone));
        setActionOpen(true);
        return;
      }

      // Quick log shortcut (doesn't need action menu)
      if (input === "l") {
        openLogs(ZONES[zoneSelected]);
        return;
      }

      // Global shortcuts from zones view
      if (input === "g") { runOp("Git push", (o) => gitPush(o));          return; }
      if (input === "R") { runOp("Reload proxy", (o) => reloadProxy(o));  return; }
      if (input === "a") { runOp("Build all + deploy", (o) => buildAll(o)); return; }
    }

    // ── Infra view ───────────────────────────────────────────────────────────
    if (view === "infra") {
      if (input === "1") { setInfraView("hosts");  return; }
      if (input === "2") { setInfraView("dns");    return; }
      if (input === "3") { setInfraView("ports");  return; }
      if (input === "R") { checkInfra();           return; }
      if (infraView === "hosts") {
        if (key.upArrow   || input === "k") { setInfraSelected((s) => Math.max(0, s - 1)); return; }
        if (key.downArrow || input === "j") { setInfraSelected((s) => Math.min(INFRA_SERVICES.length - 1, s + 1)); return; }
        if (input === "r")                  { checkInfra([infraSelected]); return; }
      }
    }
  });

  // ── Action executor (called from keyboard handler and action menu Enter) ───
  function executeAction(actionId: string, zone: (typeof ZONES)[number]) {
    switch (actionId) {
      case "deploy":
        runOp(`Deploy  ${zone.label}`,   (o) => deployZone(zone, o));
        break;
      case "pull":
        runOp(`Pull+up  ${zone.label}`,  (o) => pullAndUp(zone, o));
        break;
      case "restart":
        runOp(`Restart  ${zone.label}`,  (o) => restartZone(zone, o));
        break;
      case "build":
        if (!zone.dockerfile) {
          setOpTitle(`Build: ${zone.key}`);
          setOpLines([`${zone.key} has no Dockerfile — use [p] pull+up instead.`]);
          setBusy(false);
          setOpOverlay("output");
          setActionOpen(false);
          break;
        }
        runOp(`Build+push  ${zone.label}`, (o) => buildZone(zone, o