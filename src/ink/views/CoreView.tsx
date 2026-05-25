// src/ink/views/CoreView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The "core" tab — permanent infrastructure that is NOT a zone.
//
//   App     (unt_app)   — the core Next.js monolith at unenter.live
//   Proxy   (unt_proxy) — the custom multi-zone reverse proxy
//
// Actions differ from zones:
//   App   → deploy / pull+up / restart / build / rebuild / logs / dev
//   Proxy → restart / build / rebuild / push-agent / logs / reset-pairing
//           sync-routes / audit-npm
//
// Neither can be deleted from here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useInput }          from "../runtimeInk.js";
import { useActionNav }                 from "../hooks/useActionNav.ts";

import type { Zone }   from "../../config/zones.ts";
import type { Status } from "../docker.ts";

import { StatusBadge }   from "../components/StatusBadge.tsx";
import { KeyHints }      from "../components/KeyHint.tsx";
import { ActionPanel, buildCoreActions, buildProxyActions, isCoreZone } from "../panels/Action/index.tsx";

import { restartZone, pullAndUp, reloadProxy, rebuildProxy } from "../docker.ts";
import { buildZone, deployZone }               from "../zone-build.ts";
import { buildAndPushAgent }                   from "../agent-ops.ts";
import { PROJECT_DIR }                         from "../../config/zones.ts";
import { addZoneRoute }                        from "../proxy-config.ts";
import { npmAddZone }                          from "../npm/index.ts";
import { unlinkSync }                          from "fs";
import { join }                                from "path";

import { useHostMonitor }      from "../hooks/useHostMonitor.ts";
import { sparkline }           from "../utils/sparkline.ts";
import { MetricCard, SectionFrame } from "../components/design-system/index.ts";
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
      : buildProxyActions(),
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
      // ── Proxy-specific actions ─────────────────────────────────────────────────
      case "build-proxy":
        // Rebuild the proxy Docker image + recreate the container.
        // Use when proxy/Dockerfile changes (new npm package, base image update).
        // Code changes to server.js / agent.js don't need this — node --watch
        // hot-reloads them automatically via the bind-mounts.
        runOp("Build proxy image + recreate", (o) => rebuildProxy(o));
        break;
      case "rebuild-proxy":
        runOp("Rebuild proxy image (clean) + recreate", (o) => rebuildProxy(o, true));
        break;
      case "push-agent":
        // Build proxy/agent.js into the GHCR agent image and push.
        // This is the publish step — after this, go to Environments → [u] on
        // the target node to pull the new image and deploy it there.
        runOp("Push agent → GHCR  (ghcr.io/…/unaxis-agent:v0)", async (o) => {
          const code = await buildAndPushAgent(o);
          if (code === 0) {
            o("✓ Agent image pushed — go to Environments → [u] on L0V3 to deploy");
          }
          return code;
        });
        break;
      // ── Generic zone actions (app + future zones) ──────────────────────────
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
        runOp(`Rebuild + Deploy  ${zone.label}  (no cache)`, async (o) => {
          if (!zone.dockerfile) { o("No Dockerfile"); return 1; }
          const code = await buildZone(zone, o, { noCache: true });
          if (code !== 0) return code;
          o("--- pull + up ---");
          return pullAndUp(zone, o);
        });
        break;
      case "logs":
        openLogs(zone);
        break;
      case "dev":
        runDevMode(zone);
        break;
      case "agent-reset":
        runOp("Reset agent pairing  (unt_proxy)", async (o) => {
          const stateFile = join(PROJECT_DIR, "proxy-config", "agent-state.json");
          try {
            unlinkSync(stateFile);
            o("✓ TOFU pairing state cleared — agent will pair on next TUI connect");
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("ENOENT")) {
              o("✓ No pairing state found — agent is already unpaired");
            } else {
              o(`✗ Could not remove state file: ${msg}`);
              return 1;
            }
          }
          o("Restarting proxy to apply...");
          return reloadProxy(o);
        });
        break;
      // ── Proxy routing management ───────────────────────────────────────────
      case "sync-routes": {
        // Rebuild routes.json for all deployable zones.
        // The proxy hot-reloads this file — no restart needed.
        const deployableZones = zones.filter((z) => !isCoreZone(z) && z.key !== "proxy");
        runOp("Sync proxy routes", async (o) => {
          if (deployableZones.length === 0) {
            o("No deployable zones found — routes.json unchanged");
            return 0;
          }
          for (const z of deployableZones) {
            await addZoneRoute(z.key, `http://${z.service}:3000`, o);
          }
          o(`\n✓ routes.json synced  (${deployableZones.length} zone${deployableZones.length !== 1 ? "s" : ""})`);
          return 0;
        });
        break;
      }

      case "audit-npm": {
        // Verify that every zone's NPM proxy host forwards to the correct upstream.
        // npmAddZone is idempotent — creates the host if missing, updates if stale.
        const deployableZones = zones.filter((z) => !isCoreZone(z) && z.key !== "proxy");
        runOp("Audit NPM hosts", async (o) => {
          if (deployableZones.length === 0) {
            o("No deployable zones found");
            return 0;
          }
          let failed = 0;
          for (const z of deployableZones) {
            o(`\n── ${z.label}  (${z.domain}) ──`);
            const code = await npmAddZone(z, o);
            if (code !== 0) failed++;
          }
          o(failed === 0
            ? `\n✓ All ${deployableZones.length} NPM hosts verified`
            : `\n⚠ ${failed} host${failed !== 1 ? "s" : ""} had errors — see above`);
          return failed === 0 ? 0 : 1;
        });
        break;
      }
    }
    setActionOpen(false);
  }, [runOp, openLogs, addNotification, zones]);

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
