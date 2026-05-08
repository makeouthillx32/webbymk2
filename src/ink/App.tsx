// src/ink/App.tsx — unt.ink TUI root orchestrator
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

import React, { useCallback } from "react";
import { useInput, useApp, render }              from "ink";
import { unstable_batchedUpdates }               from "react-dom";

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useNotifications }                from "./hooks/useNotifications.ts";
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

// ── Overlays ──────────────────────────────────────────────────────────────────
import { OperationOverlay }                from "./OperationOverlay.tsx";

// ── Utilities ─────────────────────────────────────────────────────────────────
import { linesToClipboard }                from "./utils.ts";
import { backupDatabase }                  from "./db-api.ts";

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const { exit } = useApp();

  // ── Cross-cutting utilities ────────────────────────────────────────────────
  const { copy, didCopy }          = useCopyOnSelect();
  const { notifications, addNotification } = useNotifications();

  const {
    view, history,
    navigate, navigateReplace, goBack, goRoot,
    tokenEditing, setTokenEditing,
  } = useAppRouter();

  // ── Domain state ──────────────────────────────────────────────────────────
  const {
    zones, setZones, zonesLoading,
    zoneStatuses, proxyStatus, refreshZones,
    infraResults,  infraChecking, checkInfra,
  } = useZoneManager({ addNotification });

  // ── Background operations ──────────────────────────────────────────────────
  const {
    bgOps,        setBgOps,
    overlayOpId,  setOverlayOpId,  overlayOp,
    stackOpen,    setStackOpen,
    stackFocusId, setStackFocusId,
    anyBusy,
    logProcRef,   logOpIdRef,
    runOp,        runCreateZone,   openLogs,
  } = useBackgroundOps({ addNotification, refreshZones, setZones });

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

    // ── Full-screen operation overlay — intercepts all input ────────────────
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
      if (input === "c" && overlayOp) { copy(linesToClipboard(overlayOp.lines)); return; }
      return;
    }

    // ── [o] — toggle background stack pane (available on every view) ────────
    if (input === "o" && bgOps.length > 0) {
      setStackOpen((s) => !s);
      return;
    }

    // ── Stack navigation (when pane is open) ─────────────────────────────────
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

  }, { isActive: !tokenEditing });

  // ── Render ────────────────────────────────────────────────────────────────
  // Everything lives inside AlternateScreen so the TUI occupies the terminal's
  // alt-screen buffer.  This means:
  //   • The renderer uses CSI H (cursor-home) + full/diff paint — no cursor-up
  //     relative moves that break when the user scrolls the main screen.
  //   • The terminal never grows: no new lines are ever appended to the scrollback.
  //   • On exit, the main screen content is fully restored.
  return (
    <AlternateScreen>

      {/* ── Full-screen overlay: operation output ─────────────────────── */}
      {overlayOpId !== null && (
        <OperationOverlay
          title={overlayOp?.title ?? ""}
          lines={overlayOp?.lines ?? []}
          busy={overlayOp?.busy ?? false}
          mode={overlayOp?.isLog ? "logs" : "output"}
          didCopy={didCopy}
        />
      )}

      {/* ── Zone creation wizard — full-screen, no chrome ─────────────── */}
      {overlayOpId === null && view === "wizard" && (
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
      {overlayOpId === null && view !== "wizard" && (
        <AppShell
          view={view}
          history={history}
          bgOps={bgOps}
          stackOpen={stackOpen}
          stackFocusId={stackFocusId}
          notifications={notifications}
          didCopy={didCopy}
        >

          {view === "welcome" && (
            <WelcomeScreen
              zones={zones}
              zoneStatuses={zoneStatuses}
              proxyStatus={proxyStatus}
              busy={anyBusy}
              onManage={()   => navigate("zones")}
              onSettings={() => navigate("settings")}
              onQuit={exit}
              isActive={!stackOpen}
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
              runOp={runOp}
              openLogs={openLogs}
              addNotification={addNotification}
              onGoBack={goBack}
              isActive={!stackOpen}
            />
          )}

          {view === "zones" && (
            <ZonesView
              zones={zones}
              zoneStatuses={zoneStatuses}
              proxyStatus={proxyStatus}
              setZones={setZones}
              runOp={runOp}
              openLogs={openLogs}
              addNotification={addNotification}
              onGoBack={goBack}
              onNewZone={() => navigate("wizard")}
              isActive={!stackOpen}
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
              onBackup={() => runOp("DB backup", (o) => backupDatabase(o))}
              onCopy={copy}
              onGoBack={goBack}
            />
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

render(<App />, {
  patchConsole: false,   // don't hijack console.log (use onLine callbacks)
  exitOnCtrlC:  false,   // App handles Ctrl-C / q itself via useApp().exit()
});
