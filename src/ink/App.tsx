// src/ink/App.tsx — UNAXIS TUI root orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Composes all hooks and routes to the active view.  This file is intentionally
// thin — it wires state together and owns only the logic that genuinely spans
// multiple views (overlay controls, stack navigation, settings keys, tab
// cycling, infra nav).  Per-view keyboard handling lives in each view or
// screen component.
//
// Navigation model (history stack in useAppRouter):
//
//   [StartupScreen] ──onDone──▶ welcome  (project picked inside StartupScreen)
//
//   welcome ──navigate──▶ zones ──navigate──▶ wizard
//          └──navigate──▶ settings
//
//   Tab key:  navigateReplace — swaps the current panel in-place
//             (zones ↔ npm ↔ db ↔ infra) so depth stays at 2
//
//   q / ←:   goBack()  — pop one level
//             goRoot()  — collapse entirely (overlay emergency exit)
//
// Overlay / stack layers (highest priority, intercepted before view keys):
//   overlayOpId !== null   →  OperationOverlay full-screen
//   stackOpen              →  DetachedStack sidebar, j/k navigate ops
//
// Import chain:
//   src/cli.ts → src/entrypoints/cli.tsx → src/ink/App.tsx (render entry)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useInput, useApp, render } from "ink";

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useNotifications, NotificationsProvider } from "./components/Notifications.tsx";
import { useAppRouter, PANEL_TABS } from "./hooks/useAppRouter.ts";
import type { PanelTab } from "./hooks/useAppRouter.ts";
import { useZoneManager } from "./hooks/useZoneManager.ts";
import { useEnvManager } from "./hooks/useEnvManager.ts";
import { useBackgroundOps } from "./hooks/useBackgroundOps.ts";
import { useCopyOnSelect } from "./hooks/useCopyOnSelect.ts";

// ── Layout / chrome ───────────────────────────────────────────────────────────
import { AppShell } from "./components/AppShell.tsx";
import { AlternateScreen } from "./components/AlternateScreen.tsx";

// ── Screens ───────────────────────────────────────────────────────────────────
import { WelcomeScreen } from "../screens/WelcomeScreen.js";
import { SettingsScreen, openConfigInEditor } from "../screens/SettingsScreen.js";
import { ZoneWizardScreen } from "../screens/ZoneWizardScreen.js";

// ── Views ─────────────────────────────────────────────────────────────────────
import { CoreView } from "./views/CoreView.tsx";
import { ZonesView } from "./views/ZonesView.tsx";

// ── Panels ────────────────────────────────────────────────────────────────────
import { NpmPanel } from "./panels/Npm/index.tsx";
import { DbPanel } from "./panels/Db/index.tsx";
import { InfraPanel } from "./panels/Infra/index.tsx";
import { EnvPanel }          from "./panels/Env/index.tsx";
import { EnvDetailScreen }   from "./panels/Env/EnvDetailScreen.tsx";
import { NotesScreen }           from "../screens/NotesScreen.js";
import { AddEnvironmentScreen }  from "../screens/AddEnvironmentScreen.js";

// ── Overlays ──────────────────────────────────────────────────────────────────
import { OperationOverlay } from "./OperationOverlay.tsx";
import { KeybindingWire } from "./KeybindingWire.tsx";
import { StartupScreen } from "./components/StartupScreen.tsx";


// ── Utilities ─────────────────────────────────────────────────────────────────
import { setupGracefulShutdown, gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { linesToClipboard } from "./utils.ts";
import { popoutOpOutput, popoutLogTail } from "../utils/terminalPopout.ts";
import { backupDatabase } from "./db-api.ts";
import {
  startCoreStack, stopCoreStack, restartCoreStack,
  healCoreStack, verifyCoreStack, deleteRuntimeInstance,
} from "./db-api.ts";
import { spawn } from "child_process";
import { join } from "path";
import { resolveRuntimeProjectRoot } from "../utils/runtimeEnv.js";
import {
  snapshotInstance,
  restoreInstance,
  listSnapshots,
  captureTemplate,
  listTemplates,
} from "./zone/snapshot.ts";
import {
  provisionDatabase,
  createBlankDatabase,
  smokeTestDatabase,
} from "./zone/database-manager.ts";
import { loadRegistry } from "./zone/supabase-factory.ts";
import type { RuntimeInstance } from "./zone/supabase-factory.ts";
import { PROJECT_DIR } from "../config/stack.ts";

// ── Core Supabase instance descriptor ────────────────────────────────────────
// Static — no registry lookup needed for the core stack.
// slug "unenter" matches the Docker compose project name declared in
// docker-compose.yml as `name: unenter`.  All lifecycle ops that pass
// --project-name use this slug; cwd is the project root where the file lives.
const CORE_DOCKER_INSTANCE: RuntimeInstance = {
  id:              "core",
  name:            "Core Supabase",
  slug:            "unenter",
  containerPrefix: "unt_",    // containers: unt_db, unt_storage, unt_kong, …
  status:          "active",
  createdAt:       "",
  runtimePath:     PROJECT_DIR,
  dockerPath:      PROJECT_DIR,
  ports:           { kong: 8001, kongSSL: 8443, postgres: 5432, pooler: 0, analytics: 0, studio: 3002 },
  secrets:         { postgresPassword: "", jwtSecret: "", anonKey: "", serviceRoleKey: "", dashboardPassword: "" },
  studioUrl:       "",
  healthState:     "unknown",
  snapshotState:   "none",
};
import { InstanceWizardScreen } from "../screens/InstanceWizardScreen.js";
import { StackManagerScreen } from "../screens/StackManagerScreen.js";
import { devContainerName, startDevContainer, stopDevContainer } from "./dev-container.ts";
import { startIpcServer, startRemoteIpcBridge } from "./ipc-server.ts";
import { getStatus } from "./docker.ts";
import { captureDockerLogs, parseTail } from "./log-snapshot.ts";
import { loadZones } from "./zone-store.ts";
import { fetchContainers } from "./agent-client.ts";
import { updateRemoteAgent } from "./agent-ops.ts";

// Injected by build.ts via Bun.build define — same constant as cli.tsx entry point.
declare const UNAXIS_VERSION: string;
import {
  loadEnvironments,
  getActiveEnvironment,
  setActiveEnvironment,
  environmentTypeLabel,
  pingAgentHealth,
  saveAgentStatus,
} from "./environment-store.ts";
import { reconcileProxyRoutes } from "./proxy-config.ts";
import {
  appendTimeline,
  appendWatchText,
  beginWatch,
  endWatch,
  getActiveWatch,
  noteWatch,
  watchRoot,
  writeWatchText,
  type WatchMode,
} from "./watch-session.ts";
import { parseLogTail, snapshotContainerLogs } from "./log-snapshot.ts";
import { PROXY } from "../config/zones.ts";
import type { Zone } from "../config/zones.ts";
import { TerminalWriteProvider } from "./useTerminalNotification.ts";
import { TerminalSizeProvider } from "./components/TerminalSizeContext.tsx";

// ── App ───────────────────────────────────────────────────────────────────────

// Skip splash only when explicitly opted out or running in CI.
// noSplash is module-level so it evaluates once at startup.
const noSplash = process.env.UNAXIS_NO_SPLASH === "1" || !!process.env.CI;

export function App() {
  const { exit } = useApp();

  // ── Startup animation gate ───────────────────────────────────────────────
  // Runs inside <AlternateScreen> so the animation shares the same terminal
  // buffer as the main TUI — no alt-screen clear races with the animation.
  const [splashDone, setSplashDone] = useState(noSplash);

  // ── Cross-cutting utilities ────────────────────────────────────────────────
  const { copy, didCopy } = useCopyOnSelect();
  const { notifications, addNotification } = useNotifications();

  const {
    view, history,
    navigate, navigateReplace, goBack, goRoot,
    tokenEditing, setTokenEditing,
    subCrumbs, setSubCrumbs,
  } = useAppRouter();
  const statusPollingActive = view === "welcome" || view === "core" || view === "zones";

  // ── Domain state ──────────────────────────────────────────────────────────
  const {
    zones, setZones, zonesLoading,
    zoneStatuses, proxyStatus, refreshZones,
    forceRefreshZoneList,
  } = useZoneManager({ addNotification, pollEnabled: statusPollingActive });

  // ── Environment + infra health (env topology, not zone topology) ──────────
  const {
    activeEnv,
    envStale, envDataAge, lastEnvError,
    infraResults, infraChecking, infraSource,
    checkInfra,
    refreshEnvs,
  } = useEnvManager();

  // ── Selected environment for detail screen ────────────────────────────────
  const [selectedEnvForDetail, setSelectedEnvForDetail] = useState<
    import("./environment-store.ts").UnaxisEnvironment | null
  >(null);

  // ── Background operations ──────────────────────────────────────────────────
  const {
    bgOps, setBgOps,
    overlayOpId, setOverlayOpId, overlayOp,
    stackOpen, setStackOpen,
    stackFocusId, setStackFocusId,
    anyBusy,
    logProcRef, logOpIdRef,
    runOp, runOpQueued, runCreateZone, openLogs,
    runDevModeOp, triggerDismissHook, triggerRestartHook,
    registerPopout, dismissPopout,
  } = useBackgroundOps({ addNotification, refreshZones, setZones });

  // ── Dev mode — zone-aware wrapper around runDevModeOp ────────────────────
  // Passes start/stop functions bound to the zone so the generic hook stays
  // decoupled from dev-container.ts.  Views call runDevMode(zone) only.
  const runDevMode = useCallback((zone: Zone) => {
    runDevModeOp(
      zone.label,
      devContainerName(zone),
      (o) => startDevContainer(zone, o),
      (o) => stopDevContainer(zone, o),
    );
  }, [runDevModeOp]);

  const ipcStateRef = useRef({
    view,
    bgOps,
    proxyStatus,
  });

  useEffect(() => {
    ipcStateRef.current = { view, bgOps, proxyStatus };
  }, [view, bgOps, proxyStatus]);

  // Stable ref so the IPC env-switch handler (defined once in useEffect) can
  // call refreshEnvs without closing over a stale version.
  const refreshEnvsRef = useRef(refreshEnvs);
  useEffect(() => { refreshEnvsRef.current = refreshEnvs; }, [refreshEnvs]);

  // ── Stack focus — separate from visibility ────────────────────────────────
  // stackOpen        = strip is rendered (auto-set when ops start)
  // stackFocused     = strip owns keyboard; panels stay active when this is false
  // stackManagerOpen = full-screen op manager overlay (shows ALL ops + preview)
  const [stackFocused, setStackFocused] = useState(false);
  const [stackManagerOpen, setStackManagerOpen] = useState(false);

  // activeEnv and its polling now live in useEnvManager above.

  // ── Auto-exit focus when all ops drain away ───────────────────────────────
  // If bgOps empties while stackFocused is true (e.g. all ops finish or are
  // dismissed externally), no component owns useInput and the TUI locks up.
  // This effect is the safety net — it resets focus state whenever the ops
  // list hits zero so the main panel always regains keyboard control.
  useEffect(() => {
    if (bgOps.length === 0) {
      setStackFocused(false);
      setStackOpen(false);
      setStackManagerOpen(false);
    }
  }, [bgOps.length, setStackOpen]);

  // ── IPC server — CLI agent bridge ─────────────────────────────────────────
  // Starts a local TCP server (127.0.0.1:50505) so external CLI calls like
  // `unaxis dev core` or `unaxis restart core` can drive the TUI operations
  // without needing a separate process.  The handlers call the same underlying
  // dev-container functions the TUI uses; the TUI refreshes via normal polling.
  useEffect(() => {
    // Keep a stable ref to zones so handlers always see the latest list.
    const resolveZone = async (key: string): Promise<Zone | null> => {
      const all = await loadZones();
      return all.find((z) => z.key === key || z.label?.toLowerCase() === key.toLowerCase()) ?? null;
    };

    const formatDevStatus = async (zone: Zone): Promise<string> => {
      const status = await getStatus(devContainerName(zone));
      if (status === "running") return "● running";
      if (status === "starting") return "◌ starting";
      return "○ stopped";
    };

    const printZoneStatus = async (zone: Zone, onLine: (line: string) => void) => {
      onLine(`${zone.label} · ${zone.domain}`);
      onLine(`  key       : ${zone.key}`);
      onLine(`  container : ${zone.container}`);
      onLine(`  dev       : ${await formatDevStatus(zone)} (${devContainerName(zone)})`);
      onLine(`✓ zone status`);
      return 0;
    };

    const takeSessionSnapshot = async (reason = "manual snapshot"): Promise<string> => {
      const all = await loadZones();
      const { view: currentView, bgOps: currentOps, proxyStatus: currentProxy } = ipcStateRef.current;
      const zoneLines = await Promise.all(all.map(async (z) =>
        `  ${z.key.padEnd(18)} ${await formatDevStatus(z)}  ${z.domain}`
      ));
      const stackLines = currentOps.length === 0
        ? ["  stack empty"]
        : currentOps.map((op) => {
          const state = op.busy ? (op.dismissable ? "live" : "running") : "done";
          const last = op.lines[op.lines.length - 1];
          return `  #${op.id} ${state.padEnd(7)} ${op.title}${last ? ` · ${last}` : ""}`;
        });

      return [
        `UNAXIS watch snapshot`,
        `reason : ${reason}`,
        `time   : ${new Date().toISOString()}`,
        `cwd    : ${process.cwd()}`,
        `view   : ${currentView}`,
        `proxy  : ${currentProxy}`,
        "",
        "zones:",
        ...zoneLines,
        "",
        "stack:",
        ...stackLines,
        "",
      ].join("\n");
    };

    const argValue = (args: string[], name: string): string | undefined => {
      const idx = args.indexOf(name);
      return idx >= 0 ? args[idx + 1] : undefined;
    };

    const validMode = (value: string | undefined): WatchMode | undefined => {
      if (value === "light" || value === "dev" || value === "risky") return value;
      return undefined;
    };

    const server = startIpcServer({

      // unaxis version  — TUI version + live agent ping on every registered environment
      // Returns package version immediately, then pings agents concurrently.
      // Offline fallback is handled in cli.tsx (prints pkg version if TUI is down).
      version: async (_args, onLine) => {
        onLine(`\nUNAXIS  ${UNAXIS_VERSION}\n`);
        const all = await loadEnvironments();
        if (all.length === 0) {
          onLine("  (no environments configured)");
          onLine("✓ version");
          return 0;
        }
        // Ping all environments concurrently for speed
        const results = await Promise.all(
          all.map(async (env) => {
            if (!env.agentUrl) return { env, online: false, version: "", detail: "no agent url" };
            const result = await pingAgentHealth(env);
            await saveAgentStatus(env.id, result);
            return { env, ...result };
          })
        );
        for (const r of results) {
          const dot     = r.online ? "●" : "○";
          const status  = r.online ? "online " : "offline";
          const ver     = r.online && r.version ? `agent v${r.version}` : (r.detail ?? "unreachable");
          const def     = r.env.isDefaultTarget ? "  (default)" : "";
          const host    = r.env.agentUrl.replace(/^https?:\/\//, "").replace(/:8888\/?$/, "");
          onLine(`  ${dot} ${r.env.name.padEnd(8)} ${host.padEnd(18)} ${status}  ${ver}${def}`);
        }
        onLine(`\n✓ version`);
        return 0;
      },

      // unaxis dev <zone>  — toggle dev container on/off
      dev: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine("✗ usage: dev <zone-key>"); return 1; }
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }
        const status = await getStatus(devContainerName(zone));
        if (status === "running" || status === "starting") {
          onLine(`Stopping dev container for ${zone.label}…`);
          return stopDevContainer(zone, onLine);
        }
        onLine(`Starting dev container for ${zone.label}…`);
        return startDevContainer(zone, onLine);
      },

      // unaxis restart <zone>  — hard stop → start
      restart: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine("✗ usage: restart <zone-key>"); return 1; }
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }
        onLine(`Restarting dev container for ${zone.label}…`);
        const stopCode = await stopDevContainer(zone, onLine);
        if (stopCode !== 0) return stopCode;
        return startDevContainer(zone, onLine);
      },

      // unaxis list  — show all zones and their dev container status
      list: async (_args, onLine) => {
        const all = await loadZones();
        if (all.length === 0) { onLine("(no zones configured)"); return 0; }
        for (const z of all) {
          onLine(`  ${z.key.padEnd(18)} ${await formatDevStatus(z)}  ${z.domain}`);
        }
        onLine(`✓ ${all.length} zone${all.length !== 1 ? "s" : ""}`);
        return 0;
      },

      // unaxis zones  — clearer alias for list
      zones: async (_args, onLine) => {
        const all = await loadZones();
        if (all.length === 0) { onLine("(no zones configured)"); return 0; }
        for (const z of all) {
          onLine(`  ${z.key.padEnd(18)} ${await formatDevStatus(z)}  ${z.domain}`);
        }
        onLine(`✓ ${all.length} zone${all.length !== 1 ? "s" : ""}`);
        return 0;
      },

      // unaxis envs  — list all configured environments
      envs: async (_args, onLine) => {
        const all = await loadEnvironments();
        if (all.length === 0) { onLine("(no environments configured)"); return 0; }
        for (const e of all) {
          const activeMarker = e.active ? "●" : "○";
          const statusColor = e.status === "up" ? "up" : e.status === "down" ? "down" : "unk";
          onLine(
            `  ${activeMarker} ${e.name.padEnd(16)} ${statusColor.padEnd(5)} ${environmentTypeLabel(e.type).padEnd(14)} ${e.domain}`
          );
        }
        const activeEnv = all.find((e) => e.active);
        onLine(`✓ ${all.length} environment${all.length !== 1 ? "s" : ""}${activeEnv ? ` (active: ${activeEnv.name})` : ""}`);
        return 0;
      },

      // unaxis ping-envs  — ping /health on every registered environment's agent
      // Zero-keystroke equivalent of navigating to Environments → [p] on each node.
      // Returns name, agentUrl, version, online/offline for every environment.
      "ping-envs": async (_args, onLine) => {
        const all = await loadEnvironments();
        if (all.length === 0) { onLine("(no environments configured)"); return 0; }

        onLine(`Pinging ${all.length} environment${all.length !== 1 ? "s" : ""}…`);
        let failed = 0;

        for (const env of all) {
          if (!env.agentUrl) {
            onLine(`  ○ ${env.name.padEnd(16)} no agent configured`);
            continue;
          }

          onLine(`  … ${env.name.padEnd(16)} ${env.agentUrl}`);
          const result = await pingAgentHealth(env);
          await saveAgentStatus(env.id, result);

          if (result.online) {
            const version = result.version ? `v${result.version}` : "version unknown";
            onLine(`  ✓ ${env.name.padEnd(16)} online   ${version}   ${env.agentUrl}`);
          } else {
            failed++;
            const detail = result.detail ?? "unreachable";
            onLine(`  ✗ ${env.name.padEnd(16)} offline  ${detail}`);
          }
        }

        const passed = all.filter((e) => !!e.agentUrl).length - failed;
        onLine(`\n✓ ping-envs complete  —  ${passed} online, ${failed} failed`);
        return failed > 0 ? 1 : 0;
      },

      // unaxis env status|use|list  — inspect or switch active environment
      env: async (args, onLine) => {
        const sub = args[0] ?? "status";

        // unaxis env status  — show the active environment
        if (sub === "status") {
          const active = await getActiveEnvironment();
          if (!active) {
            onLine("✗ no active environment");
            onLine("  run: unaxis envs   to see all environments");
            return 1;
          }
          onLine(`✓ active environment: ${active.name}`);
          onLine(`  type      : ${environmentTypeLabel(active.type)}`);
          onLine(`  domain    : ${active.domain}`);
          onLine(`  npm       : ${active.npmHost}:${active.npmPort}`);
          onLine(`  proxy     : ${active.proxyHost}:${active.proxyPort}`);
          onLine(`  ddns      : ${active.ddnsHostname}`);
          onLine(`  public    : ${active.publicUrl}`);
          onLine(`  status    : ${active.status}`);
          if (active.npmSecretId) onLine(`  npm-secret : configured`);
          if (active.azureAppIdSecretId) onLine(`  azure-cred : configured`);
          return 0;
        }

        // unaxis env use <name>  — switch the active environment
        if (sub === "use") {
          const targetName = args[1];
          if (!targetName) {
            onLine("✗ usage: env use <environment-name>");
            return 2;
          }
          const all = await loadEnvironments();
          const target = all.find((e) => e.name === targetName);
          if (!target) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }
          if (target.active) {
            onLine(`○ already active: ${target.name}`);
            return 0;
          }
          onLine(`• switching to environment: ${target.name}…`);
          const result = await setActiveEnvironment(target.id);
          if (!result) {
            onLine("✗ failed to switch environment — check TUI logs");
            return 1;
          }
          // Bust cache and push the new active env into TUI state immediately.
          refreshEnvsRef.current();
          onLine(`✓ switched to: ${result.name}`);
          onLine(`  type   : ${environmentTypeLabel(result.type)}`);
          onLine(`  domain : ${result.domain}`);
          onLine(`  proxy  : ${result.proxyHost}:${result.proxyPort}`);
          return 0;
        }

        // unaxis env list  — alias for unaxis envs
        if (sub === "list") {
          const all = await loadEnvironments();
          if (all.length === 0) { onLine("(no environments configured)"); return 0; }
          for (const e of all) {
            const marker = e.isDefaultTarget ? "● (default)" : "○";
            onLine(`  ${marker.padEnd(13)} ${e.name.padEnd(16)} ${environmentTypeLabel(e.type).padEnd(14)} ${e.domain}`);
          }
          return 0;
        }

        // unaxis env ping [<name>]
        // Ping one named environment, or all environments if no name given.
        if (sub === "ping") {
          const targetName = args[1];
          const all        = await loadEnvironments();
          if (all.length === 0) { onLine("(no environments configured)"); return 0; }

          const targets = targetName
            ? all.filter((e) => e.name.toLowerCase() === targetName.toLowerCase())
            : all;

          if (targets.length === 0) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }

          let failed = 0;
          for (const env of targets) {
            if (!env.agentUrl) {
              onLine(`  ○ ${env.name.padEnd(16)} no agent configured`);
              continue;
            }
            const result = await pingAgentHealth(env);
            await saveAgentStatus(env.id, result);
            if (result.online) {
              const ver = result.version ? `v${result.version}` : "version unknown";
              onLine(`  ✓ ${env.name.padEnd(16)} online   ${ver}   ${env.agentUrl}`);
            } else {
              failed++;
              onLine(`  ✗ ${env.name.padEnd(16)} offline  ${result.detail ?? "unreachable"}`);
            }
          }
          const passed = targets.filter((e) => !!e.agentUrl).length - failed;
          onLine(`✓ ping complete  —  ${passed} online, ${failed} failed`);
          return failed > 0 ? 1 : 0;
        }

        // unaxis env containers [<name>] [--all]
        // List containers on a named environment (or the default env).
        // By default shows only unt_* containers; --all shows everything.
        if (sub === "containers") {
          // Disambiguate: is the next arg an env name or a flag?
          const showAll    = args.includes("--all");
          const nameArg    = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
          const all        = await loadEnvironments();

          let env = nameArg
            ? all.find((e) => e.name.toLowerCase() === nameArg.toLowerCase())
            : all.find((e) => e.isDefaultTarget) ?? all[0];

          if (!env) {
            onLine(nameArg
              ? `✗ environment not found: "${nameArg}"`
              : "✗ no environments configured");
            return 1;
          }
          if (!env.agentUrl) {
            onLine(`✗ ${env.name} has no agent configured`);
            return 1;
          }

          onLine(`Fetching containers on ${env.name} (${env.agentUrl})…`);
          const containers = await fetchContainers(env);
          if (!containers) {
            onLine(`✗ Could not reach agent — is ${env.name} online?`);
            return 1;
          }

          const visible = showAll
            ? containers
            : containers.filter((c) => c.Names.some((n) => n.replace(/^\//, "").startsWith("unt_")));

          if (visible.length === 0) {
            onLine(showAll ? "  (no containers)" : "  (no unt_* containers — try --all)");
            onLine(`✓ ${env.name}`);
            return 0;
          }

          for (const c of visible) {
            const dot   = c.State === "running" ? "●" : "○";
            const name  = c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12);
            const state = c.State.padEnd(8);
            onLine(`  ${dot} ${name.padEnd(22)} ${state}  ${c.Image}`);
          }
          const running = visible.filter((c) => c.State === "running").length;
          onLine(`\n✓ ${visible.length} container${visible.length !== 1 ? "s" : ""}  (${running} running)  —  ${env.name}`);
          return 0;
        }

        // unaxis env update <name>
        // Trigger a self-update on the named environment's agent.
        // The agent pulls the latest image, spawns the updater container,
        // and atomically replaces itself. Returns 202 immediately then dies —
        // poll with `unaxis env ping <name>` to confirm the new version is up.
        if (sub === "update") {
          const targetName = args[1];
          if (!targetName) {
            onLine("✗ usage: env update <environment-name>");
            return 2;
          }
          const all    = await loadEnvironments();
          const target = all.find((e) => e.name.toLowerCase() === targetName.toLowerCase());
          if (!target) {
            onLine(`✗ environment not found: "${targetName}"`);
            onLine(`  available: ${all.map((e) => e.name).join(", ")}`);
            return 1;
          }
          return updateRemoteAgent(target, onLine);
        }

        onLine(`✗ unknown env command: "${sub}"`);
        onLine("  usage: env list | env ping [<name>] | env containers [<name>] [--all] | env update <name> | env status | env use <name>");
        return 2;
      },

      // unaxis session  — agent-friendly snapshot of the attached TUI
      session: async (_args, onLine) => {
        const [all, activeEnv] = await Promise.all([loadZones(), getActiveEnvironment()]);
        const { view: currentView, bgOps: currentOps, proxyStatus: currentProxy } = ipcStateRef.current;
        const running = currentOps.filter((o) => o.busy && !o.dismissable).length;
        const live = currentOps.filter((o) => o.busy && o.dismissable).length;
        const done = currentOps.filter((o) => !o.busy).length;
        onLine("✓ UNAXIS TUI is running");
        onLine(`  cwd    : ${process.cwd()}`);
        if (activeEnv) {
          onLine(`  env    : ${activeEnv.name} (${environmentTypeLabel(activeEnv.type)})`);
          onLine(`  domain : ${activeEnv.domain}`);
        }
        onLine(`  view   : ${currentView}`);
        onLine(`  proxy  : ${currentProxy}`);
        onLine(`  zones  : ${all.length}`);
        onLine(`  stack  : ${running} running, ${live} live, ${done} done`);
        return 0;
      },

      // unaxis stack  — compact list of visible TUI ops
      stack: async (_args, onLine) => {
        const ops = ipcStateRef.current.bgOps;
        if (ops.length === 0) { onLine("✓ stack empty"); return 0; }
        for (const op of ops) {
          const state = op.busy ? (op.dismissable ? "live" : "running") : "done";
          const last = op.lines[op.lines.length - 1];
          onLine(`  #${op.id} ${state.padEnd(7)} ${op.title}${last ? ` · ${last}` : ""}`);
        }
        onLine(`✓ ${ops.length} stack item${ops.length !== 1 ? "s" : ""}`);
        return 0;
      },

      // unaxis watch begin|status|note|snapshot|end
      watch: async (args, onLine) => {
        const sub = args[0] ?? "status";

        if (sub === "begin") {
          const label = (argValue(args, "--label") ?? args.slice(1).filter((a) => !a.startsWith("--")).join(" ")) || "agent session";
          const mode = validMode(argValue(args, "--mode")) ?? (args.includes("--db-backup") ? "risky" : "light");
          const zone = argValue(args, "--zone");
          const session = beginWatch({ label, mode, zone });
          const snapshot = await takeSessionSnapshot("watch begin");
          writeWatchText(session, "preflight.txt", snapshot);
          onLine(`✓ watch started: ${session.id}`);
          onLine(`  label : ${session.label}`);
          onLine(`  mode  : ${session.mode}`);
          if (session.zone) onLine(`  zone  : ${session.zone}`);
          onLine(`  dir   : ${session.dir}`);

          if (args.includes("--db-backup")) {
            onLine("• DB backup requested by watch begin");
            appendTimeline(session, "db.backup.start", { reason: "watch begin" });
            const lines: string[] = [];
            const code = await backupDatabase((line) => {
              lines.push(line);
              onLine(line);
            });
            appendWatchText(session, "backups.txt", lines.join("\n") + "\n");
            appendTimeline(session, "db.backup.end", { exitCode: code });
            if (code !== 0) return code;
          }
          return 0;
        }

        if (sub === "status") {
          const session = getActiveWatch();
          if (!session) {
            onLine(`○ no active watch`);
            onLine(`  root: ${watchRoot()}`);
            return 0;
          }
          onLine(`✓ watch active: ${session.id}`);
          onLine(`  label : ${session.label}`);
          onLine(`  mode  : ${session.mode}`);
          if (session.zone) onLine(`  zone  : ${session.zone}`);
          onLine(`  dir   : ${session.dir}`);
          return 0;
        }

        if (sub === "note") {
          const message = args.slice(1).join(" ").trim();
          if (!message) { onLine("✗ usage: watch note <message>"); return 2; }
          const session = noteWatch(message);
          if (!session) { onLine("✗ no active watch"); return 1; }
          onLine(`✓ note recorded: ${message}`);
          return 0;
        }

        if (sub === "snapshot") {
          const session = getActiveWatch();
          if (!session) { onLine("✗ no active watch"); return 1; }
          const reason = (argValue(args, "--reason") ?? args.slice(1).filter((a) => !a.startsWith("--")).join(" ")) || "manual snapshot";
          const text = await takeSessionSnapshot(reason);
          const filename = `snapshot-${Date.now()}.txt`;
          writeWatchText(session, filename, text);
          appendTimeline(session, "snapshot", { reason, file: filename });
          onLine(`✓ snapshot recorded: ${filename}`);
          return 0;
        }

        if (sub === "end") {
          const session = endWatch();
          if (!session) { onLine("○ no active watch"); return 0; }
          onLine(`✓ watch ended: ${session.id}`);
          onLine(`  dir: ${session.dir}`);
          return 0;
        }

        onLine(`✗ unknown watch command: ${sub}`);
        onLine("  usage: watch begin|status|note|snapshot|end");
        return 2;
      },

      // unaxis db <sub> [args…]
      //
      // Subcommands:
      //   backup [--reason <text>]                 — pg_dump into core backup dir
      //   logs [--tail <n>]                        — stream unt_db container logs
      //   snapshot [--slug <slug>]                 — full snapshot bundle + compress
      //   restore --bundle <path>                  — restore an instance from bundle
      //   snapshots [--slug <slug>]                — list snapshot bundles for instance
      //   template-capture [--force]               — capture fresh vanilla template
      //   templates                                — list available templates
      //   provision <slug> --kong <n> --studio <n> --pg <n> --ssl <n> --dir <path>
      //                                            — full provision: clone + proxy + NPM + MCP
      db: async (args, onLine) => {
        const sub = args[0];

        // ── db logs ──────────────────────────────────────────────────────────
        if (sub === "logs") {
          const tail = parseTail(args);
          const result = await captureDockerLogs({
            label: "db",
            container: "unt_db",
            tail,
          }, onLine);
          if (result.code === 0) onLine(`✓ db logs (${result.tail} lines)`);
          return result.code;
        }

        // ── db backup ────────────────────────────────────────────────────────
        if (sub === "backup") {
          const reason = argValue(args, "--reason") ?? "manual CLI backup";
          const session = getActiveWatch();
          if (session) appendTimeline(session, "db.backup.start", { reason });
          const lines: string[] = [];
          const code = await backupDatabase((line) => {
            lines.push(line);
            onLine(line);
          });
          if (session) {
            appendWatchText(session, "backups.txt", `# ${new Date().toISOString()} ${reason}\n${lines.join("\n")}\n`);
            appendTimeline(session, "db.backup.end", { reason, exitCode: code });
          }
          return code;
        }

        // ── db snapshot [--slug <slug>] ───────────────────────────────────────
        if (sub === "snapshot") {
          const targetSlug = argValue(args, "--slug");
          const registry   = await loadRegistry();
          const inst: RuntimeInstance | undefined =
            targetSlug
              ? (registry.find((i) => i.slug === targetSlug) ?? CORE_DOCKER_INSTANCE)
              : CORE_DOCKER_INSTANCE;

          if (!inst) { onLine(`✗ no instance with slug "${targetSlug}"`); return 1; }
          await snapshotInstance(inst, onLine);
          return 0;
        }

        // ── db snapshots [--slug <slug>] ──────────────────────────────────────
        if (sub === "snapshots") {
          const targetSlug = argValue(args, "--slug");
          const registry   = await loadRegistry();
          const inst: RuntimeInstance =
            (targetSlug ? registry.find((i) => i.slug === targetSlug) : undefined) ?? CORE_DOCKER_INSTANCE;

          const bundles = await listSnapshots(inst);
          if (bundles.length === 0) {
            onLine(`  (no snapshots for ${inst.slug})`);
            return 0;
          }
          for (const b of bundles) {
            const archTag = b.archivePath ? " ✓ .tar.gz" : "";
            onLine(`  ${b.id}  ${new Date(b.createdAt).toLocaleString()}${archTag}`);
          }
          onLine(`✓ ${bundles.length} snapshot${bundles.length !== 1 ? "s" : ""} for ${inst.slug}`);
          return 0;
        }

        // ── db restore --bundle <path> ────────────────────────────────────────
        if (sub === "restore") {
          const bundlePath = argValue(args, "--bundle");
          if (!bundlePath) { onLine("✗ usage: db restore --bundle <path-to-bundle-dir>"); return 1; }
          return await restoreInstance(bundlePath, onLine);
        }

        // ── db template-capture [--force] ─────────────────────────────────────
        if (sub === "template-capture") {
          const force     = args.includes("--force");
          const maxAge    = force ? 0 : 30;
          const template  = await captureTemplate(onLine, maxAge);
          onLine(`\n✓ Template ready: ${template.archivePath}`);
          return 0;
        }

        // ── db templates ──────────────────────────────────────────────────────
        if (sub === "templates") {
          const templates = await listTemplates();
          if (templates.length === 0) {
            onLine("  (no templates — run: db template-capture)");
            return 0;
          }
          for (const t of templates) {
            const ageDays = ((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000).toFixed(0);
            onLine(`  fresh-${t.version}.tar.gz  (${ageDays}d old)  →  ${t.archivePath}`);
          }
          onLine(`✓ ${templates.length} template${templates.length !== 1 ? "s" : ""}`);
          return 0;
        }

        // ── db provision <slug> ───────────────────────────────────────────────
        // Usage: db provision <slug> --kong <n> --studio <n> --pg <n> --ssl <n> --dir <path>
        //        [--bundle <path>]  (omit to use fresh template)
        //        [--no-npm]         (skip NPM SSL registration)
        if (sub === "provision") {
          const slug = args[1];
          if (!slug || slug.startsWith("--")) {
            onLine("✗ usage: db provision <slug> --kong <port> --studio <port> --pg <port> --ssl <port> --dir <path>");
            onLine("         [--bundle <path>]  — source bundle (omit = fresh template)");
            onLine("         [--no-npm]         — skip NPM SSL registration");
            return 1;
          }

          const kongPort   = parseInt(argValue(args, "--kong")   ?? "", 10);
          const studioPort = parseInt(argValue(args, "--studio") ?? "", 10);
          const pgPort     = parseInt(argValue(args, "--pg")     ?? "", 10);
          const sslPort    = parseInt(argValue(args, "--ssl")    ?? `${kongPort + 443}`, 10);
          const targetDir  = argValue(args, "--dir");
          const bundlePath = argValue(args, "--bundle");
          const noNpm      = args.includes("--no-npm");

          if (!kongPort || !studioPort || !pgPort || !targetDir) {
            onLine("✗ --kong, --studio, --pg, and --dir are all required");
            return 1;
          }

          await provisionDatabase(
            slug,
            {
              bundlePath: bundlePath ?? undefined,
              targetDir,
              ports: { kong: kongPort, studio: studioPort, postgres: pgPort, kongSSL: sslPort },
              registerNpm: !noNpm,
            },
            null,   // keys: will be in mcp-config.json as placeholders
            onLine,
          );
          return 0;
        }

        // ── db blank <slug> [--no-npm] ────────────────────────────────────────
        // Fastest path: scaffold + start a fresh empty Supabase instance.
        // MCP config is written with real keys immediately.
        // Usage: db blank <slug> [--no-npm] [--name "Human Label"]
        if (sub === "blank") {
          const slug = args[1];
          if (!slug || slug.startsWith("--")) {
            onLine("✗ usage: db blank <slug> [--no-npm] [--name <label>]");
            return 1;
          }
          const noNpm = args.includes("--no-npm");
          const name  = argValue(args, "--name");
          await createBlankDatabase(slug, { registerNpm: !noNpm, instanceName: name }, onLine);
          return 0;
        }

        // ── db smoke-test ──────────────────────────────────────────────────────
        // End-to-end test: blank DB → Postgres probe → Kong probe → Studio probe
        // → snapshot → list snapshots → teardown.
        if (sub === "smoke-test") {
          const result = await smokeTestDatabase(onLine);
          return result.ok ? 0 : 1;
        }

        onLine("✗ usage: db backup|logs|snapshot|snapshots|restore|template-capture|templates|provision|blank|smoke-test");
        return 2;
      },

      // unaxis preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]
      preflight: async (args, onLine) => {
        const sub = args[0];
        if (sub !== "edit") {
          onLine("✗ usage: preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]");
          return 2;
        }

        const zoneName = argValue(args, "--zone");
        if (!zoneName) {
          onLine("✗ usage: preflight edit --zone <zone> [--db-backup] [--dev] [--watch] [--label <text>]");
          return 2;
        }

        const zone = await resolveZone(zoneName);
        if (!zone) {
          onLine(`✗ zone not found: "${zoneName}"`);
          return 1;
        }

        const wantsBackup = args.includes("--db-backup");
        const wantsDev = args.includes("--dev");
        const wantsWatch = args.includes("--watch");
        const label = argValue(args, "--label") ?? `preflight edit ${zone.key}`;
        const busyOps = ipcStateRef.current.bgOps.filter((op) => op.busy && !op.dismissable);

        onLine("UNAXIS preflight edit");
        onLine(`  zone  : ${zone.key} (${zone.label})`);
        onLine(`  domain: ${zone.domain}`);
        onLine("✓ TUI session attached");

        let session = getActiveWatch();
        let createdWatch = false;
        if (wantsWatch && !session) {
          const mode: WatchMode = wantsBackup ? "risky" : (wantsDev ? "dev" : "light");
          session = beginWatch({ label, mode, zone: zone.key });
          createdWatch = true;
          onLine(`✓ watch started: ${session.id}`);
        } else if (session) {
          onLine(`✓ watch active: ${session.id}`);
        } else {
          onLine("○ watch not requested");
        }

        if (session) {
          appendTimeline(session, "preflight.edit.start", {
            zone: zone.key,
            dbBackup: wantsBackup,
            dev: wantsDev,
            createdWatch,
          });
        }

        if (busyOps.length > 0) {
          onLine(`✗ stack busy: ${busyOps.length} running operation${busyOps.length !== 1 ? "s" : ""}`);
          for (const op of busyOps.slice(0, 3)) onLine(`  #${op.id} ${op.title}`);
          if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: 1, reason: "stack busy" });
          return 1;
        }
        onLine("✓ stack clear");

        const snapshot = await takeSessionSnapshot(`preflight edit ${zone.key}`);
        if (session) {
          const file = `preflight-edit-${Date.now()}.txt`;
          writeWatchText(session, file, snapshot);
          appendTimeline(session, "snapshot", { reason: "preflight edit", file });
          onLine(`✓ snapshot recorded: ${file}`);
        } else {
          onLine("✓ snapshot captured");
        }

        await printZoneStatus(zone, (line) => {
          if (!line.startsWith("✓")) onLine(line);
        });

        if (wantsBackup) {
          const reason = `preflight edit ${zone.key}`;
          onLine("• DB backup requested");
          if (session) appendTimeline(session, "db.backup.start", { reason, zone: zone.key });
          const lines: string[] = [];
          const code = await backupDatabase((line) => {
            lines.push(line);
            onLine(line);
          });
          if (session) {
            appendWatchText(session, "backups.txt", `# ${new Date().toISOString()} ${reason}\n${lines.join("\n")}\n`);
            appendTimeline(session, "db.backup.end", { reason, zone: zone.key, exitCode: code });
          }
          if (code !== 0) {
            if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: code });
            return code;
          }
        } else {
          onLine("○ DB backup skipped");
        }

        if (wantsDev) {
          const status = await getStatus(devContainerName(zone));
          if (status === "running" || status === "starting") {
            onLine(`✓ dev container already ${status} for ${zone.label}`);
          } else {
            if (session) appendTimeline(session, "zone.dev.start", { zone: zone.key, container: devContainerName(zone) });
            const code = await startDevContainer(zone, onLine);
            if (session) appendTimeline(session, "zone.dev.end", { zone: zone.key, container: devContainerName(zone), exitCode: code });
            if (code !== 0) {
              if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: code });
              return code;
            }
          }
        } else {
          onLine("○ dev start skipped");
        }

        onLine("✓ preflight ready");
        onLine(`  edit zone : ${zone.key}`);
        onLine(`  live URL  : https://${zone.domain}`);
        if (wantsDev) onLine(`  dev logs  : docker logs -f ${devContainerName(zone)}`);
        if (session) appendTimeline(session, "preflight.edit.end", { zone: zone.key, exitCode: 0 });
        return 0;
      },

      // unaxis zone <name> status
      // unaxis zone <name> logs [--tail <lines>]
      // unaxis zone <name> dev start|stop|restart
      // unaxis zone <name> dev logs [--tail <lines>]
      zone: async (args, onLine) => {
        const zoneName = args[0];
        if (!zoneName) { onLine("✗ usage: zone <zone-key> status|logs|dev <start|stop|restart|logs>"); return 2; }
        const zone = await resolveZone(zoneName);
        if (!zone) { onLine(`✗ zone not found: "${zoneName}"`); return 1; }

        const action = args[1] ?? "status";
        if (action === "status") {
          return printZoneStatus(zone, onLine);
        }

        if (action === "logs") {
          const tail = parseTail(args.slice(2));
          const result = await captureDockerLogs({
            label: zone.key,
            container: zone.container,
            tail,
          }, onLine);
          if (result.code === 0) onLine(`✓ zone logs: ${zone.key} (${result.tail} lines)`);
          return result.code;
        }

        if (action !== "dev") {
          onLine(`✗ unknown zone action: ${action}`);
          onLine("  usage: zone <zone-key> status|logs|dev <start|stop|restart|logs>");
          return 2;
        }

        const verb = args[2];
        if (!verb || !["start", "stop", "restart", "logs"].includes(verb)) {
          onLine("✗ usage: zone <zone-key> dev <start|stop|restart|logs>");
          return 2;
        }

        if (verb === "logs") {
          const tail = parseTail(args.slice(3));
          const container = devContainerName(zone);
          const result = await captureDockerLogs({
            label: `${zone.key}-dev`,
            container,
            tail,
          }, onLine);
          if (result.code === 0) onLine(`✓ zone dev logs: ${zone.key} (${result.tail} lines)`);
          return result.code;
        }

        if (verb === "start") {
          const status = await getStatus(devContainerName(zone));
          if (status === "running" || status === "starting") {
            onLine(`✓ dev container already running for ${zone.label}`);
            return 0;
          }
          return startDevContainer(zone, onLine);
        }

        if (verb === "stop") {
          return stopDevContainer(zone, onLine);
        }

        onLine(`Restarting dev container for ${zone.label}…`);
        const stopCode = await stopDevContainer(zone, onLine);
        if (stopCode !== 0) return stopCode;
        return startDevContainer(zone, onLine);
      },

      // unaxis status  — confirm TUI is alive
      status: async (_args, onLine) => {
        onLine(`✓ UNAXIS TUI is running`);
        return 0;
      },

      // unaxis logs proxy|db [--tail <lines>]
      logs: async (args, onLine) => {
        const target = args[0];
        if (!target || !["proxy", "db"].includes(target)) {
          onLine("✗ usage: logs proxy|db [--tail <lines>]");
          return 2;
        }
        const tail = parseTail(args.slice(1));
        const container = target === "proxy" ? PROXY.container : "unt_db";
        const result = await captureDockerLogs({
          label: target,
          container,
          tail,
        }, onLine);
        if (result.code === 0) onLine(`✓ ${target} logs (${result.tail} lines)`);
        return result.code;
      },
    });

    // ── Remote IPC bridge (port 50506) ─────────────────────────────────────
    // Authenticated tunnel: validates stored token, then pipes to local :50505.
    // Always started — does nothing until a valid pairing key is generated.
    const bridge = startRemoteIpcBridge(async () => {
      const { getCredential } = await import('../utils/secureStorage/index.js');
      const token = await getCredential('remote_bridge_token');
      const exp   = await getCredential('remote_bridge_token_exp');
      if (!token || !exp) return null;
      return { token, exp: parseInt(exp, 10) };
    });

    return () => { server.close(); bridge.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proxy reconciliation on startup ───────────────────────────────────────
  // Supabase is the source of truth for zones. On every TUI boot, rebuild
  // routes.json from the live zone list + actual Docker container state so
  // the proxy is always in sync — no manual routes.json edits needed.
  useEffect(() => {
    loadZones()
      .then((zones) => reconcileProxyRoutes(zones, (name) => getStatus(name)))
      .catch(() => { /* Supabase or proxy unreachable at boot — leave routes as-is */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── goHome — overlay emergency exit: kills log, collapses to welcome ──────
  // goRoot() clears the entire history stack so any dangling view state is
  // abandoned.  Only used for the overlay q/Esc exit; normal back navigation
  // uses goBack() instead.
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
    setOverlayOpId(null);
    goRoot();
    if (anyBusy) setStackOpen(true);
  }, [overlayOp, anyBusy, logProcRef, logOpIdRef, setBgOps, setOverlayOpId, goRoot, setStackOpen]);

  // ── Global keyboard handler ────────────────────────────────────────────────
  useInput((input, key) => {

    // ── Quit paths — highest priority, with terminal cleanup ────────────────
    if (key.ctrl && input === "c") { gracefulShutdownSync(0); return; }
    if (input === "q" && view === "welcome") { gracefulShutdownSync(0); return; }

    // ── [o] — toggle stack focus (available on every view) ──────────────────
    // Stack strip auto-shows when ops start (stackOpen managed by useBackgroundOps).
    // [o] shifts keyboard focus to/from the strip so the user can either
    // interact with running ops OR keep working in the main panel.
    if (input === "o" && bgOps.length > 0) {
      if (!stackOpen) setStackOpen(true);   // ensure strip is visible first
      setStackFocused((f) => !f);
      return;
    }

    // ── [O] — open/close full-screen stack manager ───────────────────────────
    // Capital O opens the StackManagerScreen which shows ALL ops (including any
    // that are behind a hidden strip) with an inline output preview per op.
    if (input === "O" && bgOps.length > 0) {
      setStackManagerOpen((v) => !v);
      if (!stackManagerOpen) {
        // Entering manager: unfocus the strip so its useInput doesn't compete
        setStackFocused(false);
      }
      return;
    }

    // The wizard captures all its own input via internal useInput hooks.
    if (view === "wizard") return;

    // ── Settings keys ─────────────────────────────────────────────────────────
    if (view === "settings") {
      if (key.escape || input === "q") { goBack(); return; }
      if (input === "e") { openConfigInEditor(); return; }
      return;
    }

    // ── Tab — lateral cycle through panel views (replaces, doesn't push) ─────
    if (key.tab && (PANEL_TABS as readonly string[]).includes(view)) {
      const idx = PANEL_TABS.indexOf(view as PanelTab);
      navigateReplace(PANEL_TABS[(idx + 1) % PANEL_TABS.length]);
      return;
    }

    // q / ← back is handled individually by each panel's own useInput so that
    // pressing q inside a sub-menu (e.g. ActionPanel) doesn't also fire goBack
    // at the root level.  See NpmPanel, DbPanel, InfraPanel, ZonesView.

  }, { isActive: !tokenEditing && splashDone });

  // ── Overlay keyboard callbacks ─────────────────────────────────────────────
  // These used to live inline inside the global useInput overlay-guard block.
  // Now OperationOverlay owns its input and calls these when keys fire.

  const handleOverlayQ = useCallback(() => {
    // Q detaches back to the strip just like Esc — it no longer calls goHome()
    // (which was goRoot() → navigate-to-welcome, losing the user's view).
    // Ctrl-C is the escape hatch for a true full-quit.
    const isLog = overlayOp?.isLog ?? false;
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
    if (bgOps.length > 0) setStackOpen(true);
    setOverlayOpId(null);
  }, [overlayOp, bgOps, logProcRef, logOpIdRef, setBgOps, setStackOpen, setOverlayOpId]);

  const handleOverlayEsc = useCallback(() => {
    const isLog = overlayOp?.isLog ?? false;
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
    // Always show the strip on detach if any ops remain — covers busy ops,
    // done ops, and dev-mode ops that are dismissable (busy:false) but still live.
    if (bgOps.length > 0) setStackOpen(true);
    setOverlayOpId(null);
  }, [overlayOp, bgOps, logProcRef, logOpIdRef, setBgOps, setStackOpen, setOverlayOpId]);

  // ── Overlay [esc] on a dismissable op (dev mode) ─────────────────────────────
  // Fires the dismiss hook (kills log proc + runs stopDevContainer cleanup),
  // then closes the overlay and shows the strip so the user can watch cleanup.
  // This is the "hard stop" path — the container is actually removed.
  // Contrast with handleOverlayQ (below) which just detaches without stopping.
  const handleOverlayKill = useCallback(() => {
    if (!overlayOp) return;
    triggerDismissHook(overlayOp.id);
    setOverlayOpId(null);
    // Always show the strip — cleanup messages will appear there while
    // stopDevContainer removes the container + NPM host + proxy route.
    setStackOpen(true);
  }, [overlayOp, triggerDismissHook, setOverlayOpId, setStackOpen]);

  const handleOverlayEnter = useCallback(() => {
    setOverlayOpId(null);
  }, [setOverlayOpId]);

  const handleOverlayCopy = useCallback(() => {
    if (overlayOp) copy(linesToClipboard(overlayOp.lines));
  }, [overlayOp, copy]);

  const handleOverlayCopyTail = useCallback((tailLines: string[]) => {
    copy(linesToClipboard(tailLines));
  }, [copy]);

  const handleOverlayRestart = useCallback(() => {
    if (overlayOpId !== null) triggerRestartHook(overlayOpId);
  }, [overlayOpId, triggerRestartHook]);

  const handleOverlayPopout = useCallback(() => {
    if (!overlayOp) return;
    if (overlayOp.isLog && overlayOp.lines.length > 0) {
      const containerMatch = overlayOp.lines[0]?.match(/Streaming logs: (\S+)/);
      const container = containerMatch?.[1];
      if (logProcRef.current) {
        logProcRef.current.kill();
        logProcRef.current = null;
      }
      if (logOpIdRef.current !== null) {
        setBgOps((prev) =>
          prev.map((o) => o.id === logOpIdRef.current ? { ...o, busy: false } : o)
        );
        logOpIdRef.current = null;
      }
      if (container) popoutLogTail(container);
    } else {
      popoutOpOutput(overlayOp.id, overlayOp.title, overlayOp.lines);
      registerPopout(overlayOp.id);
    }
    setOverlayOpId(null);
  }, [overlayOp, logProcRef, logOpIdRef, setBgOps, setOverlayOpId, registerPopout]);

  // ── Stack keyboard callbacks ───────────────────────────────────────────────
  // Extracted from the global useInput block. DetachedStack owns the useInput
  // registration; these callbacks carry the actual state transitions.

  const handleStackUp = useCallback(() => {
    setBgOps((prev) => {
      const idx = prev.findIndex((o) => o.id === stackFocusId);
      const next = (idx - 1 + prev.length) % prev.length;
      setStackFocusId(prev[next]?.id ?? null);
      return prev;
    });
  }, [setBgOps, stackFocusId, setStackFocusId]);

  const handleStackDown = useCallback(() => {
    setBgOps((prev) => {
      const idx = prev.findIndex((o) => o.id === stackFocusId);
      const next = (idx + 1) % prev.length;
      setStackFocusId(prev[next]?.id ?? null);
      return prev;
    });
  }, [setBgOps, stackFocusId, setStackFocusId]);

  const handleStackEnter = useCallback(() => {
    if (stackFocusId === null) return;
    setOverlayOpId(stackFocusId);
    setStackOpen(false);
  }, [stackFocusId, setOverlayOpId, setStackOpen]);

  const handleStackDismiss = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    // Allow dismiss when done OR when the op explicitly opted into dismissable
    // (e.g. dev-mode ops that are streaming logs but can be stopped on demand).
    if (op && (op.dismissable ?? !op.busy)) {
      triggerDismissHook(op.id);
      dismissPopout(op.id);
      const remaining = bgOps.filter((o) => o.id !== stackFocusId);
      setBgOps(remaining);
      setStackFocusId(remaining[remaining.length - 1]?.id ?? null);
      if (remaining.length === 0) { setStackOpen(false); setStackFocused(false); }
    }
  }, [bgOps, stackFocusId, triggerDismissHook, dismissPopout, setBgOps, setStackFocusId, setStackOpen]);

  const handleStackDismissAll = useCallback(() => {
    // Dismiss done ops + any explicitly dismissable ones (e.g. active dev logs)
    const dismissible = bgOps.filter((o) => o.dismissable ?? !o.busy);
    dismissible.forEach((o) => { triggerDismissHook(o.id); dismissPopout(o.id); });
    const running = bgOps.filter((o) => o.busy && !o.dismissable);
    setBgOps(running);
    setStackFocusId(running[running.length - 1]?.id ?? null);
    if (running.length === 0) { setStackOpen(false); setStackFocused(false); }
  }, [bgOps, triggerDismissHook, dismissPopout, setBgOps, setStackFocusId, setStackOpen]);

  const handleStackPopout = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (!op) return;
    if (op.isLog) {
      const containerMatch = op.lines[0]?.match(/Streaming logs: (\S+)/);
      const container = containerMatch?.[1];
      if (logProcRef.current) {
        logProcRef.current.kill();
        logProcRef.current = null;
      }
      if (logOpIdRef.current !== null) {
        setBgOps((prev) =>
          prev.map((o) => o.id === logOpIdRef.current ? { ...o, busy: false } : o)
        );
        logOpIdRef.current = null;
      }
      if (container) popoutLogTail(container);
    } else {
      popoutOpOutput(op.id, op.title, op.lines);
      registerPopout(op.id);
    }
  }, [bgOps, stackFocusId, logProcRef, logOpIdRef, setBgOps, registerPopout]);

  const handleStackCopy = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (op) copy(linesToClipboard(op.lines));
  }, [bgOps, stackFocusId, copy]);

  /** Copy only the visible tail lines (what's shown in the log box). */
  const LOG_TAIL = 8;
  const handleStackCopyTail = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (op) copy(linesToClipboard(op.lines.slice(-LOG_TAIL)));
  }, [bgOps, stackFocusId, copy]);

  const handleStackClose = useCallback(() => {
    // Give keyboard control back to the main panel — strip stays visible so
    // running ops are still tracked.  The strip disappears on its own when all
    // ops are dismissed.
    setStackFocused(false);
  }, [setStackFocused]);

  const handleStackHide = useCallback(() => {
    // Collapse the strip without dismissing any ops.  [o] or a new op start
    // will bring it back.  Distinct from dismiss — ops survive, just not visible.
    setStackOpen(false);
    setStackFocused(false);
  }, [setStackOpen, setStackFocused]);

  const handleStackManagerClose = useCallback(() => {
    setStackManagerOpen(false);
  }, [setStackManagerOpen]);

  // ── Dev-only ops (dead code in prod bundle via NODE_ENV define) ──────────
  const handleRelease = useCallback(() => {
    const root = resolveRuntimeProjectRoot();
    if (!root) { addNotification("Project root not found — cannot release"); return; }
    const inkDir = join(root, "src", "ink");
    const scriptPath = join(inkDir, "release.ts");
    runOpQueued("Release UNAXIS", (onLine) => new Promise((resolve) => {
      // process.execPath = absolute path to the currently-running Bun binary.
      // Never rely on "bun" string + PATH lookup — on Windows, shell: false
      // uses uv_spawn which can't find bun.exe via PATH in all launch contexts.
      const child = spawn(process.execPath, [scriptPath, "--publish"], {
        cwd: inkDir,
        env: { ...process.env, FORCE_COLOR: "0" },
        shell: false,
      });
      const pipe = (data: Buffer) =>
        data.toString().split("\n").forEach((l) => l.trim() && onLine(l));
      child.stdout.on("data", pipe);
      child.stderr.on("data", pipe);
      child.on("error", (err) => { onLine("✗ spawn error: " + err.message); resolve(1); });
      child.on("close", (code) => resolve(code ?? 0));
    }), "next");
  }, [runOpQueued, addNotification]);

  const handleBuild = useCallback(() => {
    const root = resolveRuntimeProjectRoot();
    if (!root) { addNotification("Project root not found — cannot build"); return; }
    const inkDir = join(root, "src", "ink");
    const scriptPath = join(inkDir, "build.ts");
    runOpQueued("Build UNAXIS (local)", (onLine) => new Promise((resolve) => {
      const child = spawn(process.execPath, [scriptPath], {
        cwd: inkDir,
        env: { ...process.env, FORCE_COLOR: "0" },
        shell: false,
      });
      const pipe = (data: Buffer) =>
        data.toString().split("\n").forEach((l) => l.trim() && onLine(l));
      child.stdout.on("data", pipe);
      child.stderr.on("data", pipe);
      child.on("error", (err) => { onLine("✗ spawn error: " + err.message); resolve(1); });
      child.on("close", (code) => resolve(code ?? 0));
    }), "next");
  }, [runOpQueued, addNotification]);

  // ── Render ────────────────────────────────────────────────────────────────
  // Everything lives inside AlternateScreen so the TUI occupies the terminal's
  // alt-screen buffer.  This means:
  //   • The renderer uses CSI H (cursor-home) + full/diff paint — no cursor-up
  //     relative moves that break when the user scrolls the main screen.
  //   • The terminal never grows: no new lines are ever appended to the scrollback.
  //   • On exit, the main screen content is fully restored.
  return (
    <AlternateScreen>

      {/* ── Startup animation + project picker — exclusive gate ─────────── */}
      {!splashDone && (
        <StartupScreen
          instant={noSplash}
          onDone={() => setSplashDone(true)}
          onQuit={() => exit()}
        />
      )}

      {/* ── Full-screen overlay: operation output ─────────────────────── */}
      {splashDone && overlayOpId !== null && (
        <OperationOverlay
          title={overlayOp?.title ?? ""}
          lines={overlayOp?.lines ?? []}
          busy={overlayOp?.busy ?? false}
          mode={overlayOp?.isLog ? "logs" : "output"}
          dismissable={overlayOp?.dismissable}
          didCopy={didCopy}
          onQ={handleOverlayQ}
          onEsc={handleOverlayEsc}
          onKill={handleOverlayKill}
          onEnter={handleOverlayEnter}
          devReady={overlayOp?.devReady}
          onCopy={handleOverlayCopy}
          onCopyTail={handleOverlayCopyTail}
          onRestart={handleOverlayRestart}
          onPopout={handleOverlayPopout}
        />
      )}

      {/* ── Stack manager — full-screen op list (O from anywhere) ───────── */}
      {splashDone && overlayOpId === null && stackManagerOpen && (
        <StackManagerScreen
          ops={bgOps}
          focusedId={stackFocusId}
          didCopy={didCopy}
          onUp={handleStackUp}
          onDown={handleStackDown}
          onEnter={() => {
            // Open focused op in overlay and close the manager
            handleStackEnter();
            setStackManagerOpen(false);
          }}
          onDismiss={handleStackDismiss}
          onDismissAll={handleStackDismissAll}
          onPopout={handleStackPopout}
          onCopy={handleStackCopy}
          onClose={handleStackManagerClose}
        />
      )}

      {/* ── Zone creation wizard — full-screen, no chrome ─────────────── */}
      {splashDone && overlayOpId === null && !stackManagerOpen && view === "wizard" && (
        <ZoneWizardScreen
          onDone={(derived) => {
            goBack();           // wizard → zones
            runCreateZone(derived);
          }}
          onCancel={goBack}   // wizard → zones
          copy={copy}
          didCopy={didCopy}
        />
      )}

      {/* ── Main layout ───────────────────────────────────────────────── */}
      {splashDone && overlayOpId === null && !stackManagerOpen && view !== "wizard" && (
        <AppShell
          view={view}
          history={history}
          subCrumbs={subCrumbs}
          bgOps={bgOps}
          stackOpen={stackOpen}
          stackFocused={stackFocused}
          stackFocusId={stackFocusId}
          notifications={notifications}
          didCopy={didCopy}
          activeEnvName={activeEnv?.name}
          activeEnvType={activeEnv?.type}
          onStackUp={handleStackUp}
          onStackDown={handleStackDown}
          onStackEnter={handleStackEnter}
          onStackDismiss={handleStackDismiss}
          onStackDismissAll={handleStackDismissAll}
          onStackPopout={handleStackPopout}
          onStackCopy={handleStackCopy}
          onStackCopyTail={handleStackCopyTail}
          onStackClose={handleStackClose}
          onStackHide={handleStackHide}
        >

          {view === "welcome" && (
            <WelcomeScreen
              zones={zones}
              zoneStatuses={zoneStatuses}
              proxyStatus={proxyStatus}
              busy={anyBusy}
              onManage={() => navigate("zones")}
              onSettings={() => navigate("settings")}
              onQuit={() => gracefulShutdownSync(0)}
              onRelease={handleRelease}
              onBuild={handleBuild}
              isActive={!stackFocused}
              activeEnv={activeEnv}
            />
          )}

          {view === "settings" && (
            <SettingsScreen
              zones={zones}
              onTokenEditStart={() => setTokenEditing(true)}
              onTokenEditEnd={() => setTokenEditing(false)}
            />
          )}

          {view === "core" && (
            <CoreView
              zones={zones}
              zoneStatuses={zoneStatuses}
              proxyStatus={proxyStatus}
              runOp={runOpQueued}
              openLogs={openLogs}
              runDevMode={runDevMode}
              addNotification={addNotification}
              onGoBack={goBack}
              isActive={!stackFocused}
              onEnter={forceRefreshZoneList}
            />
          )}

          {view === "zones" && (
            <ZonesView
              zones={zones}
              zoneStatuses={zoneStatuses}
              proxyStatus={proxyStatus}
              setZones={setZones}
              runOp={runOpQueued}
              openLogs={openLogs}
              runDevMode={runDevMode}
              addNotification={addNotification}
              onGoBack={goBack}
              onNewZone={() => navigate("wizard")}
              onSubCrumbs={setSubCrumbs}
              isActive={!stackFocused}
            />
          )}

          {view === "npm" && (
            <NpmPanel
              onCopy={copy}
              onGoBack={goBack}
            />
          )}

          {view === "db" && (
            <DbPanel
              onLogs={(svc) => openLogs({
                key: svc, label: svc, domain: "",
                service: svc, container: svc,
                image: "", upstreamEnvKey: "",
              })}
              onBackup={() => runOpQueued("DB backup", (o) => backupDatabase(o), 'next')}
              onCopy={copy}
              onGoBack={goBack}

              // ── Core lifecycle controls ─────────────────────────────────
              // These operate on the core unt_* stack (the shared runtime).
              // For instances, per-instance controls go through onInstanceAction.
              // Priority: start/stop/heal = 'now' (urgent); restart = 'next';
              //           verify = 'later' (health check, not blocking).
              onStart={() => runOpQueued("Start core stack", async (o) => {
                const ok = await startCoreStack(CORE_DOCKER_INSTANCE, o);
                return ok ? 0 : 1;
              }, 'now')}
              onStop={() => runOpQueued("Stop core stack", async (o) => {
                const ok = await stopCoreStack(CORE_DOCKER_INSTANCE, o);
                return ok ? 0 : 1;
              }, 'now')}
              onRestart={() => runOpQueued("Restart core stack", async (o) => {
                const ok = await restartCoreStack(CORE_DOCKER_INSTANCE, o);
                return ok ? 0 : 1;
              }, 'next')}
              onHeal={() => runOpQueued("Heal core stack", async (o) => {
                const ok = await healCoreStack(CORE_DOCKER_INSTANCE, o);
                return ok ? 0 : 1;
              }, 'now')}
              onVerify={() => runOpQueued("Verify core stack", async (o) => {
                const report = await verifyCoreStack(CORE_DOCKER_INSTANCE, o);
                o(`\nOverall: ${report.overall}  (${report.runningCount}/${report.totalCount} running)`);
                return report.overall === "down" ? 1 : 0;
              }, 'later')}

              // ── Instance controls ─────────────────────────────────
              onInstanceAction={(action, inst: RuntimeInstance) => {
                if (action === "restart") {
                  runOpQueued(`Restart ${inst.name}`, async (o) => {
                    const ok = await restartCoreStack(inst, o);
                    return ok ? 0 : 1;
                  }, 'next');
                } else if (action === "stop") {
                  runOpQueued(`Stop ${inst.name}`, async (o) => {
                    const ok = await stopCoreStack(inst, o);
                    return ok ? 0 : 1;
                  }, 'now');
                } else if (action === "delete") {
                  runOpQueued(`Delete ${inst.name}`, async (o) => {
                    const ok = await deleteRuntimeInstance(inst, o);
                    return ok ? 0 : 1;
                  }, 'next');
                } else if (action === "snapshot") {
                  runOpQueued(`Snapshot ${inst.name}`, async (o) => {
                    await snapshotInstance(inst, o);
                    return 0;
                  }, 'later');
                } else if (action === "verify") {
                  runOpQueued(`Verify ${inst.name}`, async (o) => {
                    const report = await verifyCoreStack(inst, o);
                    o(`\nOverall: ${report.overall}  (${report.runningCount}/${report.totalCount} running)`);
                    return report.overall === "down" ? 1 : 0;
                  }, 'later');
                }
              }}

              // ── Snapshot gallery restore ────────────────────────────────
              onRestore={(bundle, inst) => runOpQueued(
                `Restore ${inst.name} ← ${bundle.id}`,
                async (o) => {
                  await restoreInstance(bundle.bundlePath, o);
                  return 0;
                },
                'next',
              )}

              // ── New instance wizard ─────────────────────────────────────
              onNewInstance={() => navigate("instance-wizard")}
              onSubCrumbs={setSubCrumbs}
            />
          )}

          {view === "instance-wizard" && (
            <InstanceWizardScreen
              onDone={(_inst) => { goBack(); }}
              onCancel={goBack}
            />
          )}

          {view === "notes" && (
            <NotesScreen onGoBack={goBack} />
          )}

          {view === "infra" && (
            <InfraPanel
              activeEnv={activeEnv}
              infraSource={infraSource}
              envStale={envStale}
              envDataAge={envDataAge}
              results={infraResults}
              checking={infraChecking}
              onCheckInfra={checkInfra}
              onGoBack={goBack}
            />
          )}

          {view === "env" && (
            <EnvPanel
              onGoBack={goBack}
              addNotification={addNotification}
              runOp={runOpQueued}
              onAddEnvironment={() => navigate("add-environment")}
              onSelectEnv={(env) => {
                setSelectedEnvForDetail(env);
                navigate("env-detail");
              }}
              envStale={envStale}
              lastEnvError={lastEnvError}
              envDataAge={envDataAge}
            />
          )}

          {view === "env-detail" && selectedEnvForDetail && (
            <EnvDetailScreen
              env={selectedEnvForDetail}
              onBack={goBack}
            />
          )}

          {view === "add-environment" && (
            <AddEnvironmentScreen
              onDone={() => { goBack(); addNotification("Environment added", "success"); }}
              onCancel={goBack}
            />
          )}

        </AppShell>
      )}

    </AlternateScreen>
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// AlternateScreen handles clearing + cursor-home on mount, so no manual
// stdout.write needed here.

setupGracefulShutdown();

render(
  <TerminalWriteProvider value={process.stdout.write.bind(process.stdout)}>
    <TerminalSizeProvider>
      <KeybindingWire><NotificationsProvider><App /></NotificationsProvider></KeybindingWire>
    </TerminalSizeProvider>
  </TerminalWriteProvider>,
  {
    patchConsole: false,   // don't hijack console.log (use onLine callbacks)
    exitOnCtrlC: false,   // App handles Ctrl-C / q itself via useApp().exit()
  },
)
