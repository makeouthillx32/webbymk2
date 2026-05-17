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
import { useInput, useApp, render }              from "ink";
import { unstable_batchedUpdates }               from "react-dom";

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useNotifications, NotificationsProvider } from "./components/Notifications.tsx";
import { useAppRouter, PANEL_TABS }        from "./hooks/useAppRouter.ts";
import type { PanelTab }                   from "./hooks/useAppRouter.ts";
import { useZoneManager }                  from "./hooks/useZoneManager.ts";
import { useBackgroundOps }                from "./hooks/useBackgroundOps.ts";
import { useCopyOnSelect }                 from "./hooks/useCopyOnSelect.ts";

// ── Layout / chrome ───────────────────────────────────────────────────────────
import { AppShell }                        from "./components/AppShell.tsx";
import { AlternateScreen }                 from "./components/AlternateScreen.tsx";

// ── Screens ───────────────────────────────────────────────────────────────────
import { WelcomeScreen }                   from "./screens/WelcomeScreen.tsx";
import { SettingsScreen, openConfigInEditor } from "./screens/SettingsScreen.tsx";
import { ZoneWizardScreen }                from "./screens/ZoneWizardScreen.tsx";

// ── Views ─────────────────────────────────────────────────────────────────────
import { CoreView }                        from "./views/CoreView.tsx";
import { ZonesView }                       from "./views/ZonesView.tsx";

// ── Panels ────────────────────────────────────────────────────────────────────
import { NpmPanel }                        from "./panels/Npm/index.tsx";
import { DbPanel }                         from "./panels/Db/index.tsx";
import { InfraPanel }                      from "./panels/Infra/index.tsx";
import { NotesScreen }                     from "./screens/NotesScreen.tsx";

// ── Overlays ──────────────────────────────────────────────────────────────────
import { OperationOverlay }                from "./OperationOverlay.tsx";
import { KeybindingWire }                  from "./KeybindingWire.tsx";
import { StartupScreen }                   from "./components/StartupScreen.tsx";


// ── Utilities ─────────────────────────────────────────────────────────────────
import { setupGracefulShutdown, gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { linesToClipboard }                from "./utils.ts";
import { popoutOpOutput, popoutLogTail } from "../utils/terminalPopout.ts";
import { backupDatabase }                  from "./db-api.ts";
import {
  startCoreStack, stopCoreStack, restartCoreStack,
  healCoreStack, verifyCoreStack, deleteRuntimeInstance,
}                                          from "./db-api.ts";
import { spawn }                           from "child_process";
import { join }                            from "path";
import { resolveRuntimeProjectRoot }       from "../utils/runtimeEnv.js";
import { snapshotInstance, restoreInstance } from "./zone/snapshot.ts";
import { loadRegistry }                     from "./zone/supabase-factory.ts";
import type { RuntimeInstance }            from "./zone/supabase-factory.ts";
import { InstanceWizardScreen }            from "./screens/InstanceWizardScreen.tsx";
import { StackManagerScreen }              from "./screens/StackManagerScreen.tsx";
import { devContainerName, startDevContainer, stopDevContainer } from "./dev-container.ts";
import { startIpcServer }                  from "./ipc-server.ts";
import { getStatus }                       from "./docker.ts";
import { captureDockerLogs, parseTail }    from "./log-snapshot.ts";
import { loadZones }                       from "./zone-store.ts";
import { reconcileProxyRoutes }            from "./proxy-config.ts";
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
}                                          from "./watch-session.ts";
import { parseLogTail, snapshotContainerLogs } from "./log-snapshot.ts";
import { PROXY }                          from "../config/zones.ts";
import type { Zone }                       from "../config/zones.ts";
import { TerminalWriteProvider }           from "./useTerminalNotification.ts";

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
  const { copy, didCopy }          = useCopyOnSelect();
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
    infraResults,  infraChecking, checkInfra,
  } = useZoneManager({ addNotification, pollEnabled: statusPollingActive });

  // ── Background operations ──────────────────────────────────────────────────
  const {
    bgOps,        setBgOps,
    overlayOpId,  setOverlayOpId,  overlayOp,
    stackOpen,    setStackOpen,
    stackFocusId, setStackFocusId,
    anyBusy,
    logProcRef,   logOpIdRef,
    runOp,        runOpQueued,     runCreateZone,   openLogs,
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

  // ── Stack focus — separate from visibility ────────────────────────────────
  // stackOpen        = strip is rendered (auto-set when ops start)
  // stackFocused     = strip owns keyboard; panels stay active when this is false
  // stackManagerOpen = full-screen op manager overlay (shows ALL ops + preview)
  const [stackFocused,     setStackFocused]     = useState(false);
  const [stackManagerOpen, setStackManagerOpen] = useState(false);

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

      // unaxis session  — agent-friendly snapshot of the attached TUI
      session: async (_args, onLine) => {
        const all = await loadZones();
        const { view: currentView, bgOps: currentOps, proxyStatus: currentProxy } = ipcStateRef.current;
        const running = currentOps.filter((o) => o.busy && !o.dismissable).length;
        const live = currentOps.filter((o) => o.busy && o.dismissable).length;
        const done = currentOps.filter((o) => !o.busy).length;
        onLine("✓ UNAXIS TUI is running");
        onLine(`  cwd    : ${process.cwd()}`);
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

      // unaxis db backup [--reason "..."]
      db: async (args, onLine) => {
        const sub = args[0];
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

        if (sub !== "backup") {
          onLine("✗ usage: db backup [--reason <text>] | db logs [--tail <lines>]");
          return 2;
        }
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

    return () => { server.close(); };
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
    unstable_batchedUpdates(() => {
      setOverlayOpId(null);
      goRoot();
      if (anyBusy) setStackOpen(true);
    });
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
    unstable_batchedUpdates(() => {
      if (bgOps.length > 0) setStackOpen(true);
      setOverlayOpId(null);
    });
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
    unstable_batchedUpdates(() => {
      // Always show the strip on detach if any ops remain — covers busy ops,
      // done ops, and dev-mode ops that are dismissable (busy:false) but still live.
      if (bgOps.length > 0) setStackOpen(true);
      setOverlayOpId(null);
    });
  }, [overlayOp, bgOps, logProcRef, logOpIdRef, setBgOps, setStackOpen, setOverlayOpId]);

  // ── Overlay [esc] on a dismissable op (dev mode) ─────────────────────────────
  // Fires the dismiss hook (kills log proc + runs stopDevContainer cleanup),
  // then closes the overlay and shows the strip so the user can watch cleanup.
  // This is the "hard stop" path — the container is actually removed.
  // Contrast with handleOverlayQ (below) which just detaches without stopping.
  const handleOverlayKill = useCallback(() => {
    if (!overlayOp) return;
    triggerDismissHook(overlayOp.id);
    unstable_batchedUpdates(() => {
      setOverlayOpId(null);
      // Always show the strip — cleanup messages will appear there while
      // stopDevContainer removes the container + NPM host + proxy route.
      setStackOpen(true);
    });
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
      const idx  = prev.findIndex((o) => o.id === stackFocusId);
      const next = (idx - 1 + prev.length) % prev.length;
      setStackFocusId(prev[next]?.id ?? null);
      return prev;
    });
  }, [setBgOps, stackFocusId, setStackFocusId]);

  const handleStackDown = useCallback(() => {
    setBgOps((prev) => {
      const idx  = prev.findIndex((o) => o.id === stackFocusId);
      const next = (idx + 1) % prev.length;
      setStackFocusId(prev[next]?.id ?? null);
      return prev;
    });
  }, [setBgOps, stackFocusId, setStackFocusId]);

  const handleStackEnter = useCallback(() => {
    if (stackFocusId === null) return;
    unstable_batchedUpdates(() => {
      setOverlayOpId(stackFocusId);
      setStackOpen(false);
    });
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
    unstable_batchedUpdates(() => {
      setStackOpen(false);
      setStackFocused(false);
    });
  }, [setStackOpen, setStackFocused]);

  const handleStackManagerClose = useCallback(() => {
    setStackManagerOpen(false);
  }, [setStackManagerOpen]);

  // ── Dev-only ops (dead code in prod bundle via NODE_ENV define) ──────────
  const handleRelease = useCallback(() => {
    const root = resolveRuntimeProjectRoot();
    if (!root) { addNotification("Project root not found — cannot release"); return; }
    const inkDir     = join(root, "src", "ink");
    const scriptPath = join(inkDir, "release.ts");
    runOpQueued("Release UNAXIS", (onLine) => new Promise((resolve) => {
      // process.execPath = absolute path to the currently-running Bun binary.
      // Never rely on "bun" string + PATH lookup — on Windows, shell: false
      // uses uv_spawn which can't find bun.exe via PATH in all launch contexts.
      const child = spawn(process.execPath, [scriptPath, "--publish"], {
        cwd:   inkDir,
        env:   { ...process.env, FORCE_COLOR: "0" },
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
    const inkDir     = join(root, "src", "ink");
    const scriptPath = join(inkDir, "build.ts");
    runOpQueued("Build UNAXIS (local)", (onLine) => new Promise((resolve) => {
      const child = spawn(process.execPath, [scriptPath], {
        cwd:   inkDir,
        env:   { ...process.env, FORCE_COLOR: "0" },
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

      {/* ── Startup animation — exclusive gate ────────────────────────── */}
      {!splashDone && (
        <StartupScreen instant={noSplash} onDone={() => setSplashDone(true)} />
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
              onManage={()   => navigate("zones")}
              onSettings={() => navigate("settings")}
              onQuit={() => gracefulShutdownSync(0)}
              onRelease={handleRelease}
              onBuild={handleBuild}
              isActive={!stackFocused}
            />
          )}

          {view === "settings" && (
            <SettingsScreen
              zones={zones}
              onTokenEditStart={() => setTokenEditing(true)}
              onTokenEditEnd={()   => setTokenEditing(false)}
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
                const list = await loadRegistry();
                const core = list[0];   // primary / only core instance
                if (!core) { o("No registered core instance found in registry."); return 1; }
                const ok = await startCoreStack(core, o);
                return ok ? 0 : 1;
              }, 'now')}
              onStop={() => runOpQueued("Stop core stack", async (o) => {
                const list = await loadRegistry();
                const core = list[0];
                if (!core) { o("No registered instance."); return 1; }
                const ok = await stopCoreStack(core, o);
                return ok ? 0 : 1;
              }, 'now')}
              onRestart={() => runOpQueued("Restart core stack", async (o) => {
                const list = await loadRegistry();
                const core = list[0];
                if (!core) { o("No registered instance."); return 1; }
                const ok = await restartCoreStack(core, o);
                return ok ? 0 : 1;
              }, 'next')}
              onHeal={() => runOpQueued("Heal core stack", async (o) => {
                const list = await loadRegistry();
                const core = list[0];
                if (!core) { o("No registered instance."); return 1; }
                const ok = await healCoreStack(core, o);
                return ok ? 0 : 1;
              }, 'now')}
              onVerify={() => runOpQueued("Verify core stack", async (o) => {
                const list = await loadRegistry();
                const core = list[0];
                if (!core) { o("No registered instance."); return 1; }
                const report = await verifyCoreStack(core, o);
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
              results={infraResults}
              checking={infraChecking}
              onCheckInfra={checkInfra}
              onGoBack={goBack}
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
    <KeybindingWire><NotificationsProvider><App /></NotificationsProvider></KeybindingWire>
  </TerminalWriteProvider>,
  {
    patchConsole: false,   // don't hijack console.log (use onLine callbacks)
    exitOnCtrlC:  false,   // App handles Ctrl-C / q itself via useApp().exit()
  },
)
