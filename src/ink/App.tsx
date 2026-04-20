// src/ink/App.tsx — unt.ink TUI orchestrator + render entry
// ─────────────────────────────────────────────────────────────────────────────
// Main React shell.  Screen state machine:
//
//   welcome ──(Enter)──▶  [Tab cycles: zones · npm · db · infra]
//                               │
//                         zones ──(Enter)──▶ ActionPanel overlay
//                                                  │
//                                           (Esc)──▶ zones
//
// Background operations run in a multi-op stack (DetachedStack).
// Multiple ops can run concurrently; each starts in full overlay then can be
// detached to the stack pane.  [o] shows/hides the stack from any view.
//
// This file owns React state, rendering, AND the render() bootstrap.
// Import chain:
//   src/cli.ts → src/entrypoints/cli.tsx → src/ink/App.tsx (this file — render entry)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { ChildProcess } from "child_process";
import { Box, Text, useInput, useApp, render } from "ink";
import { unstable_batchedUpdates } from "react-dom";

import type { Zone } from "../config/zones.ts";
import { loadZones, invalidateZoneCache } from "./zone-store.ts";
import {
  pollAll, restartZone, pullAndUp, reloadProxy, spawnLogTail, getStatus,
  doctorComposeService,
  type Status,
} from "./docker.ts";
import { buildZone, buildAll, deployAll, deployZone, gitPush } from "./zone-build.ts";
import { npmAddZone } from "./npm-api.ts";
import { scaffoldZone, deleteZone } from "./zone-scaffold.ts";
import type { DerivedZone } from "./zone-scaffold.ts";
import { backupDatabase } from "./db-api.ts";
import { drainStream, linesToClipboard } from "./utils.ts";
import { INFRA_SERVICES, checkService } from "./infra.ts";
import type { ServiceResult } from "./infra.ts";

import { WelcomeScreen }                          from "./screens/WelcomeScreen.tsx";
import { SettingsScreen, openConfigInEditor }      from "./screens/SettingsScreen.tsx";
import { ZoneWizardScreen }                        from "./screens/ZoneWizardScreen.tsx";
import { ZonesPanel }                              from "./panels/Zones/index.tsx";
import { ActionPanel, buildActions, firstEnabled } from "./panels/Action/index.tsx";
import { NpmPanel }                                from "./panels/Npm/index.tsx";
import { DbPanel }                                 from "./panels/Db/index.tsx";
import { InfraPanel, type InfraView }              from "./panels/Infra/index.tsx";
import { OperationOverlay }                        from "./OperationOverlay.tsx";
import { DetachedStack, type StackOp }             from "./components/DetachedStack.tsx";
import { Header }                                  from "./components/Header.tsx";
import { NotificationsPane, type Notification }    from "./components/Notifications.tsx";
import { Tabs }                                    from "./components/Tabs.tsx";
import { Divider }                                 from "./components/Divider.tsx";
import { useCopyOnSelect }                         from "./hooks/useCopyOnSelect.ts";
import { useWidths }                               from "./hooks/useTermWidth.ts";
import type { NpmProxyHost }                       from "./npm-api.ts";
import { npmEnableHost, npmDisableHost }           from "./npm-api.ts";

// ── Zone creation pipeline (runs detached) ────────────────────────────────────
// Each step reports to onLine so output appears in the DetachedStack overlay.
// Steps are sequential — any non-zero exit code halts the chain.

async function waitForZone(
  container: string,
  onLine: (l: string) => void,
): Promise<number> {
  const TIMEOUT  = 3 * 60_000;
  const INTERVAL = 4_000;
  const start    = Date.now();
  let   dots     = 0;

  onLine(`Polling ${container} for healthy status…`);
  while (Date.now() - start < TIMEOUT) {
    const status = await getStatus(container);
    dots++;
    if (status === "running" || status === "healthy") {
      onLine(`✓ Container is live  (${status})`);
      return 0;
    }
    onLine(`  [${dots}] ${status === "missing" ? "not started yet" : status}…`);
    await new Promise<void>((r) => setTimeout(r, INTERVAL));
  }
  onLine(`✗ Timed out waiting for ${container}`);
  return 1;
}

async function createZonePipeline(
  zone:   DerivedZone,
  onLine: (l: string) => void,
): Promise<number> {
  const step = (name: string) => onLine(`\n── ${name} ──`);

  // 1 — Scaffold + DB register
  step("scaffold");
  const scaffoldResult = await scaffoldZone(zone, onLine);
  if (scaffoldResult.exitCode !== 0) return 1;

  // 2 — Build + push image to GHCR
  step("build & push");
  const buildCode = await buildZone(zone, onLine);
  if (buildCode !== 0) { onLine(`✗ build failed (exit ${buildCode})`); return buildCode; }

  // 3 — docker compose pull + up
  step("deploy");
  const deployCode = await pullAndUp(zone, onLine);
  if (deployCode !== 0) { onLine(`✗ deploy failed (exit ${deployCode})`); return deployCode; }

  // 4 — Reload proxy so it sees the new UPSTREAM_<KEY> env var.
  //     Without this, requests for <zone>.unenter.live fall through to the
  //     default upstream (core's app) and serve the WRONG content — the
  //     zone's own template never gets rendered.  This was the exact cause
  //     of "new zones show our core landing page instead of the zone
  //     template" on first scaffold.  The scaffolder already wrote
  //     UPSTREAM_<KEY> into docker-compose.yml; this step just recreates
  //     the proxy container so the running process picks it up.
  step("reload proxy");
  const proxyCode = await reloadProxy(onLine);
  if (proxyCode !== 0) {
    onLine(`⚠ proxy reload failed (exit ${proxyCode}) — ${zone.domain} may still route to the core app.`);
    onLine(`  Press [R] on the zones panel to retry, or run: docker compose up -d --force-recreate proxy`);
  }

  // 5 — Wait for container health
  step("wait for live");
  const waitCode = await waitForZone(zone.container, onLine);
  if (waitCode !== 0) {
    onLine(`⚠ health check timed out — attempting NPM registration anyway`);
  }

  // 6 — NPM proxy host + Let's Encrypt cert
  step("NPM cert");
  await npmAddZone(zone, onLine);

  return 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type View = "welcome" | "settings" | "zones" | "npm" | "db" | "infra" | "wizard";

type StatusMap = Record<string, Status>;
type InfraMap  = Record<number, ServiceResult>;

const PANEL_TABS = ["zones", "npm", "db", "infra"] as const;
type PanelTab = typeof PANEL_TABS[number];

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const { exit } = useApp();

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const { copy, didCopy } = useCopyOnSelect();

  // ── Toast notifications ───────────────────────────────────────────────────
  const notifId = useRef(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    const id = ++notifId.current;
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5_000);
  }, []);

  // ── Zone definitions (loaded async from Supabase) ────────────────────────
  const [zones,        setZones]        = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  useEffect(() => {
    loadZones().then((z) => {
      setZones(z);
      setZonesLoading(false);
    });
  }, []);

  // ── Screen state ──────────────────────────────────────────────────────────
  const [view, setView]               = useState<View>("welcome");
  const [welcomeMenu, setWelcomeMenu] = useState(0);  // 0=Manage 1=Settings

  // ── Background operation stack (multi-op) ─────────────────────────────────
  // Every started op lives in bgOps until explicitly dismissed.
  // Multiple ops can run concurrently — no single-op busy guard.
  //
  //   overlayOpId  — id of op shown full-screen (null = no overlay)
  //   stackOpen    — whether the DetachedStack pane is visible
  //   stackFocusId — which op is "on top" in the stack (expanded)
  const opIdRef     = useRef(0);
  const logOpIdRef  = useRef<number | null>(null);
  const logProcRef  = useRef<ChildProcess | null>(null);
  const [bgOps,        setBgOps]        = useState<StackOp[]>([]);
  const [overlayOpId,  setOverlayOpId]  = useState<number | null>(null);
  const [stackOpen,    setStackOpen]    = useState(false);
  const [stackFocusId, setStackFocusId] = useState<number | null>(null);

  // Derived shortcuts
  const anyBusy  = bgOps.some((o) => o.busy);
  const overlayOp = bgOps.find((o) => o.id === overlayOpId) ?? null;

  // ── Action menu state (zones view) ────────────────────────────────────────
  const [actionOpen,     setActionOpen]     = useState(false);
  const [actionSelected, setActionSelected] = useState(0);

  // ── Zones state ───────────────────────────────────────────────────────────
  const [zoneSelected,  setZoneSelected]  = useState(0);
  const [zoneStatuses,  setZoneStatuses]  = useState<StatusMap>({});
  const [proxyStatus,   setProxyStatus]   = useState<Status>("missing");

  // ── NPM state ─────────────────────────────────────────────────────────────
  const [npmSelected, setNpmSelected] = useState(0);

  // ── Infra state ───────────────────────────────────────────────────────────
  const [infraView,     setInfraView]     = useState<InfraView>("hosts");
  const [infraSelected, setInfraSelected] = useState(0);
  const [infraResults,  setInfraResults]  = useState<InfraMap>({});
  const [infraChecking, setInfraChecking] = useState(false);

  // ── Token edit mode (suspends global useInput while SettingsScreen captures keys) ──
  const [tokenEditing, setTokenEditing] = useState(false);

  // ── Zone polling (every 5 s) ──────────────────────────────────────────────
  const refreshZones = useCallback(async () => {
    if (zones.length === 0) return;
    const { zoneStatuses: zs, proxyStatus: ps } = await pollAll(zones);
    setZoneStatuses(zs);
    setProxyStatus(ps);
  }, [zones]);

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

  // ── Internal: allocate an op slot ─────────────────────────────────────────
  // autoOverlay=true  → starts in full overlay (user will watch it immediately)
  // autoOverlay=false → starts directly in the stack
  const _startOp = useCallback((
    title: string,
    isLog: boolean,
    autoOverlay: boolean,
  ): { id: number; addLine: (l: string) => void } => {
    const id = ++opIdRef.current;
    // Batch all state mutations into one React render → one Ink repaint.
    unstable_batchedUpdates(() => {
      setBgOps((prev) => [...prev, { id, title, lines: [], busy: true, isLog }]);
      setStackFocusId(id);
      if (autoOverlay) {
        setOverlayOpId(id);
        setStackOpen(false);
      } else {
        setStackOpen(true);
      }
      setActionOpen(false);
    });

    const addLine = (l: string) =>
      setBgOps((prev) =>
        prev.map((o) => o.id === id ? { ...o, lines: [...o.lines.slice(-300), l] } : o)
      );

    return { id, addLine };
  }, []);

  // ── Streaming operation runner ─────────────────────────────────────────────
  const runOp = useCallback(
    (title: string, op: (onLine: (l: string) => void) => Promise<number>) => {
      const { id, addLine } = _startOp(title, false, true);
      op(addLine).then((code) => {
        addLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
        setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
        refreshZones();
      });
    },
    [_startOp, refreshZones],
  );

  // ── Zone creation — 5-step pipeline shown in overlay ─────────────────────
  // Starts as a full-screen overlay so output is readable without fragmenting
  // the screen.  User can press [esc] to detach it to the background stack.
  //
  // addLine calls are batched (80 ms window) so heavy docker output doesn't
  // trigger dozens of re-renders per second.
  const runCreateZone = useCallback((zone: DerivedZone) => {
    const { id, addLine: rawAddLine } = _startOp(`Create  ${zone.label}`, false, true);

    // Batch lines into a single setState per 80 ms tick
    let lineBuffer: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const addLine = (l: string) => {
      lineBuffer.push(l);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          const flush = lineBuffer.splice(0);
          flushTimer = null;
          flush.forEach(rawAddLine);
        }, 80);
      }
    };

    createZonePipeline(zone, addLine).then((code) => {
      // Flush any remaining buffered lines before marking done
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      lineBuffer.splice(0).forEach(rawAddLine);

      rawAddLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
      setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
      if (code === 0) {
        addNotification(`${zone.label} is live at ${zone.domain} ✓`, "success");
        loadZones(true).then(setZones);
      } else {
        addNotification(`Create "${zone.label}" failed — check [o] for output`, "error");
      }
      refreshZones();
    });
  }, [_startOp, addNotification, refreshZones]);

  // ── Open logs overlay ──────────────────────────────────────────────────────
  const openLogs = useCallback((zone: Zone) => {
    if (logProcRef.current) {
      logProcRef.current.kill();
      logProcRef.current = null;
      if (logOpIdRef.current !== null) {
        setBgOps((prev) =>
          prev.map((o) => o.id === logOpIdRef.current ? { ...o, busy: false } : o)
        );
        logOpIdRef.current = null;
      }
    }

    const { id, addLine } = _startOp(`Logs  ${zone.label}`, true, true);
    logOpIdRef.current = id;
    addLine(`Streaming logs: ${zone.container}`);

    const proc = spawnLogTail(zone.container, 80);
    logProcRef.current = proc;
    drainStream(proc.stdout!, addLine);
    drainStream(proc.stderr!, addLine);
  }, [_startOp]);

  // ── Action executor ───────────────────────────────────────────────────────
  function executeAction(actionId: string, zone: Zone) {
    switch (actionId) {
      case "deploy":
        runOp(`Deploy  ${zone.label}`, (o) => deployZone(zone, o));
        break;
      case "pull":
        runOp(`Pull+up  ${zone.label}`, (o) => pullAndUp(zone, o));
        break;
      case "restart":
        runOp(`Restart  ${zone.label}`, (o) => restartZone(zone, o));
        break;
      case "build":
        if (!zone.dockerfile) {
          const { addLine } = _startOp(`Build: ${zone.key}`, false, true);
          addLine(`${zone.key} has no Dockerfile — use [p] pull+up instead.`);

          setBgOps((prev) =>
            prev.map((o) => o.title === `Build: ${zone.key}` && o.busy ? { ...o, busy: false } : o)
          );
          break;
        }
        runOp(`Build+push  ${zone.label}`, (o) => buildZone(zone, o));
        break;
      case "rebuild":
        if (!zone.dockerfile) {
          const { addLine } = _startOp(`Rebuild: ${zone.key}`, false, true);
          addLine(`${zone.key} has no Dockerfile — use [p] pull+up instead.`);
          setBgOps((prev) =>
            prev.map((o) => o.title === `Rebuild: ${zone.key}` && o.busy ? { ...o, busy: false } : o)
          );
          break;
        }
        runOp(`Rebuild  ${zone.label}  (no cache)`, (o) => buildZone(zone, o, { noCache: true }));
        break;
      case "logs":
        openLogs(zone);
        break;
      case "npm":
        runOp(`Register NPM  ${zone.domain}`, (o) => npmAddZone(zone, o));
        break;
      case "doctor":
        runOp(`Fix compose  ${zone.label}`, async (o) => {
          o(`--- doctor: ${zone.label} ---`);

          // Part 1: ensure compose service has the right `image:` field.
          const changed = doctorComposeService(zone, o);
          if (changed) {
            o(`✓ docker-compose.yml patched — service '${zone.service}' now references ${zone.image}`);
          } else {
            o(`✓ compose entry for '${zone.service}' already has image: — no changes needed`);
          }

          // Part 2: recreate the proxy so it picks up UPSTREAM_<KEY>.
          // This is the fix for "new zone renders core's landing page":
          // the scaffolder wrote UPSTREAM_<KEY> into docker-compose.yml but
          // the running proxy container still has its old env and falls
          // back to UPSTREAM_UNENTER for unknown hosts.  Force-recreating
          // rereads the current compose and fixes routing.
          o(`--- reload proxy (pick up UPSTREAM_${zone.key.toUpperCase()}) ---`);
          const proxyCode = await reloadProxy(o);
          if (proxyCode === 0) {
            o(`✓ proxy recreated — ${zone.domain} now routes to ${zone.container}`);
          } else {
            o(`✗ proxy reload failed (exit ${proxyCode})`);
            o(`  Run manually: docker compose up -d --force-recreate proxy`);
          }

          o(`  Next: press [p] Pull + up to redeploy with the correct image`);
          return 0;
        });
        break;
      case "delete": {
        const { label: zLabel, key: zKey } = zone;
        runOp(`Delete zone  ${zKey}`, (o) =>
          deleteZone(zKey, o).then((r) => {
            if (r.exitCode === 0) {
              addNotification(`"${zLabel}" zone deleted`, "success");
              invalidateZoneCache();
              loadZones(true).then(setZones);
            } else {
              addNotification(`Delete "${zLabel}" failed`, "error");
            }
            return r.exitCode;
          })
        );
        break;
      }
    }
  }

  // ── NPM host toggle ───────────────────────────────────────────────────────
  const handleNpmToggle = useCallback(async (host: NpmProxyHost) => {
    try {
      if (host.enabled) await npmDisableHost(host.id);
      else await npmEnableHost(host.id);
    } catch {
      // ignore — NpmPanel will refresh and show current state
    }
  }, []);

  // ── Go home ───────────────────────────────────────────────────────────────
  const goHome = useCallback(() => {
    if (overlayOp?.isLog && logProcRef.current) {
      logProcRef.current.kill();
      logProcRef.current = null;
      if (logOpIdRef.current !== null) {
        setBgOps((prev) =>
          prev.map((o) => o.id === logOpIdRef.current ? { ...o, busy: false } : o)
        );
        logOpIdRef.current = null;
      }
    }
    unstable_batchedUpdates(() => {
      setOverlayOpId(null);
      setActionOpen(false);
      setView("welcome");
      if (anyBusy) setStackOpen(true);
    });
  }, [overlayOp, anyBusy]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // isActive:false while SettingsScreen token editor is open — prevents [esc/q]
  // from dismissing the settings view mid-type.
  useInput((input, key) => {

    // ── Full-screen operation overlay ──────────────────────────────────────
    if (overlayOpId !== null) {
      const isLog = overlayOp?.isLog ?? false;

      if (input === "q") {
        if (!isLog && overlayOp?.busy) setStackOpen(true);
        goHome();
        return;
      }
      if (key.escape) {
        if (isLog) {
          logProcRef.current?.kill();
          logProcRef.current = null;
          if (logOpIdRef.current !== null) {
            setBgOps((prev) =>
              prev.map((o) => o.id === logOpIdRef.current ? { ...o, busy: false } : o)
            );
            logOpIdRef.current = null;
          }
        }
        unstable_batchedUpdates(() => {
          if (!isLog && overlayOp?.busy) setStackOpen(true);
          setOverlayOpId(null);
        });
        return;
      }
      if (key.return && !overlayOp?.busy) { setOverlayOpId(null); return; }
      if (input === "c" && overlayOp) {
        copy(linesToClipboard(overlayOp.lines));
        return;
      }
      return;
    }

    // ── [o] toggle background stack pane — available on every view ───────
    if (input === "o" && bgOps.length > 0) {
      setStackOpen((s) => !s);
      return;
    }

    // ── Stack navigation ──────────────────────────────────────────────────
    if (stackOpen && bgOps.length > 0) {
      if (key.upArrow || input === "k") {
        setBgOps((prev) => {
          const idx  = prev.findIndex((o) => o.id === stackFocusId);
          const next = (idx - 1 + prev.length) % prev.length;
          setStackFocusId(prev[next]?.id ?? null);
          return prev;
        });
        return;
      }
      if (key.downArrow || input === "j") {
        setBgOps((prev) => {
          const idx  = prev.findIndex((o) => o.id === stackFocusId);
          const next = (idx + 1) % prev.length;
          setStackFocusId(prev[next]?.id ?? null);
          return prev;
        });
        return;
      }
      if (key.return && stackFocusId !== null) {
        unstable_batchedUpdates(() => {
          setOverlayOpId(stackFocusId);
          setStackOpen(false);
        });
        return;
      }
      if (input === "x") {
        const op = bgOps.find((o) => o.id === stackFocusId);
        if (op && !op.busy) {
          const remaining = bgOps.filter((o) => o.id !== stackFocusId);
          setBgOps(remaining);
          setStackFocusId(remaining[remaining.length - 1]?.id ?? null);
          if (remaining.length === 0) setStackOpen(false);
        }
        return;
      }
      if (input === "X") {
        const running = bgOps.filter((o) => o.busy);
        setBgOps(running);
        setStackFocusId(running[running.length - 1]?.id ?? null);
        if (running.length === 0) setStackOpen(false);
        return;
      }
      if (input === "c") {
        const op = bgOps.find((o) => o.id === stackFocusId);
        if (op) copy(linesToClipboard(op.lines));
        return;
      }
    }

    if (view === "wizard") return;

    // ── Welcome ──────────────────────────────────────────────────────────
    if (view === "welcome") {
      if (input === "q") { exit(); return; }
      if (key.upArrow   || input === "k") { setWelcomeMenu((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow || input === "j") { setWelcomeMenu((s) => Math.min(1, s + 1)); return; }
      if (key.return || key.rightArrow) {
        if (welcomeMenu === 0) setView("zones");
        else setView("settings");
        return;
      }
      if (input === "s") { setView("settings"); return; }
      return;
    }

    // ── Settings ─────────────────────────────────────────────────────────
    if (view === "settings") {
      if (key.escape || input === "q") { setView("welcome"); return; }
      if (input === "e") { openConfigInEditor(); return; }
      return;
    }

    // ── Global q → home ──────────────────────────────────────────────────
    if (input === "q" && !actionOpen) { goHome(); return; }

    // ── Tab cycles panels ─────────────────────────────────────────────────
    if (key.tab && !actionOpen) {
      const idx  = PANEL_TABS.indexOf(view as PanelTab);
      const next = PANEL_TABS[(idx + 1) % PANEL_TABS.length];
      setView(next);
      setActionOpen(false);
      return;
    }

    // ── Action panel (zones) ──────────────────────────────────────────────
    if (actionOpen && view === "zones") {
      const zone    = zones[zoneSelected];
      const actions = zone ? buildActions(zone) : [];

      if (key.escape) { setActionOpen(false); return; }
      if (input === "q") { goHome(); return; }

      if (key.upArrow || input === "k") {
        setActionSelected((s) => {
          let next = s - 1;
          while (next >= 0 && actions[next]?.disabled) next--;
          return next >= 0 ? next : s;
        });
        return;
      }
      if (key.downArrow || input === "j") {
        setActionSelected((s) => {
          let next = s + 1;
          while (next < actions.length && actions[next]?.disabled) next++;
          return next < actions.length ? next : s;
        });
        return;
      }
      if (key.return) {
        const action = actions[actionSelected];
        if (!action || action.disabled || !zone) return;
        executeAction(action.id, zone);
        return;
      }
      const matched = actions.find((a) => !a.disabled && a.key === input);
      if (matched && zone) { executeAction(matched.id, zone); return; }
      return;
    }

    // ── Zones ─────────────────────────────────────────────────────────────
    if (view === "zones") {
      if (key.upArrow   || input === "k") { setZoneSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow || input === "j") { setZoneSelected((s) => Math.min(zones.length - 1, s + 1)); return; }
      if (key.return) {
        const zone = zones[zoneSelected];
        if (!zone) return;
        setActionSelected(firstEnabled(zone));
        setActionOpen(true);
        return;
      }
      if (input === "l") { const z = zones[zoneSelected]; if (z) openLogs(z); return; }
      if (input === "n") { setView("wizard"); return; }
      if (input === "g") { runOp("Git push", (o) => gitPush(o)); return; }
      if (input === "R") { runOp("Reload proxy", (o) => reloadProxy(o)); return; }
      if (input === "a") { runOp("Build & push all", (o) => buildAll(zones, o)); return; }
      if (input === "A") { runOp("Deploy all", (o) => deployAll(zones, o)); return; }
    }

    // ── NPM ───────────────────────────────────────────────────────────────
    if (view === "npm") {
      if (key.upArrow   || input === "k") { setNpmSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow || input === "j") { setNpmSelected((s) => s + 1); return; }
    }

    // ── Infra ─────────────────────────────────────────────────────────────
    if (view === "infra") {
      if (input === "1") { setInfraView("hosts");  return; }
      if (input === "2") { setInfraView("dns");    return; }
      if (input === "3") { setInfraView("ports");  return; }
      if (input === "R") { checkInfra();            return; }
      if (infraView === "hosts") {
        if (key.upArrow   || input === "k") { setInfraSelected((s) => Math.max(0, s - 1));                    return; }
        if (key.downArrow || input === "j") { setInfraSelected((s) => Math.min(INFRA_SERVICES.length - 1, s + 1)); return; }
        if (input === "r")                  { checkInfra([infraSelected]); return; }
      }
    }

  }, { isActive: !tokenEditing });

  // ── Render ────────────────────────────────────────────────────────────────

  // Full-screen overlay: show only the operation output.
  if (overlayOpId !== null) {
    return (
      <OperationOverlay
        title={overlayOp?.title ?? ""}
        lines={overlayOp?.lines ?? []}
        busy={overlayOp?.busy ?? false}
        mode={overlayOp?.isLog ? "logs" : "output"}
        didCopy={didCopy}
      />
    );
  }

  // Zone creation wizard — full-screen, no chrome.
  if (view === "wizard") {
    return (
      <ZoneWizardScreen
        onDone={(derived) => {
          setView("zones");
          runCreateZone(derived);
        }}
        onCancel={() => setView("zones")}
      />
    );
  }

  // Main layout.
  const isPanelView = (PANEL_TABS as readonly string[]).includes(view);

  return (
    <Box flexDirection="column">

      {/* ── App header ────────────────────────────────────────────────── */}
      <Header ops={bgOps} stackOpen={stackOpen} />

      {/* ── Panel tabs (only when on a panel view) ────────────────────── */}
      {isPanelView && (
        <Tabs
          tabs={[...PANEL_TABS]}
          active={view}
          marginBottom={1}
        />
      )}

      {/* ── Active view ───────────────────────────────────────────────── */}
      {view === "welcome" && (
        <WelcomeScreen
          zones={zones}
          zoneStatuses={zoneStatuses}
          proxyStatus={proxyStatus}
          selected={welcomeMenu}
          busy={anyBusy}
        />
      )}

      {view === "settings" && (
        <SettingsScreen
          zones={zones}
          onTokenEditStart={() => setTokenEditing(true)}
          onTokenEditEnd={()   => setTokenEditing(false)}
        />
      )}

      {view === "zones" && (
        <Box flexDirection="column">
          <ZonesPanel
            zones={zones}
            zoneStatuses={zoneStatuses}
            proxyStatus={proxyStatus}
            selected={zoneSelected}
          />
          {actionOpen && zones[zoneSelected] && (
            <ActionPanel
              zone={zones[zoneSelected]!}
              status={zoneStatuses[zones[zoneSelected]!.container] ?? "missing"}
              selected={actionSelected}
            />
          )}
        </Box>
      )}

      {view === "npm" && (
        <NpmPanel
          selected={npmSelected}
          onSelect={setNpmSelected}
          onToggle={handleNpmToggle}
          onCopy={copy}
        />
      )}

      {view === "db" && (
        <DbPanel
          onLogs={(svc) => runOp(`Logs  ${svc}`, (o) =>
            spawnLogTail(svc, o).then(() => 0)
          )}
          onBackup={() => runOp("DB backup", (o) => backupDatabase(o))}
          onCopy={copy}
        />
      )}

      {view === "infra" && (
        <InfraPanel
          view={infraView}
          results={infraResults}
          selected={infraSelected}
          checking={infraChecking}
        />
      )}

      {/* ── Notifications ─────────────────────────────────────────────── */}
      <NotificationsPane notifications={notifications} />

      {/* ── Background operation stack ────────────────────────────────── */}
      {stackOpen && bgOps.length > 0 && (
        <DetachedStack
          ops={bgOps}
          focusedId={stackFocusId}
          didCopy={didCopy}
        />
      )}

    </Box>
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Clear the terminal before mounting so previous shell output doesn't
// bleed through as "ghost" frames on Windows Terminal / PowerShell.

process.stdout.write("\x1b[2J\x1b[H"); // erase screen + move cursor home

render(<App />, {
  patchConsole: false,   // don't hijack console.log (use onLine callbacks)
  exitOnCtrlC:  false,   // App handles Ctrl-C / q itself via useApp().exit()
});
