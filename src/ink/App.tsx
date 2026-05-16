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

import React, { useCallback, useState, useEffect } from "react";
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
    runDevModeOp, triggerDismissHook,
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
          onCopy={handleOverlayCopy}
          onCopyTail={handleOverlayCopyTail}
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

render(<KeybindingWire><NotificationsProvider><App /></NotificationsProvider></KeybindingWire>, {
  patchConsole: false,   // don't hijack console.log (use onLine callbacks)
  exitOnCtrlC:  false,   // App handles Ctrl-C / q itself via useApp().exit()
})
