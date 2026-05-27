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
//   src/entrypoints/cli.tsx → src/main.tsx → src/replLauncher.tsx → App
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from "react";
import { useApp } from "./runtimeInk.js";

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useNotifications } from "./components/Notifications.tsx";
import { useAppRouter } from "./hooks/useAppRouter.ts";
import { useZoneManager } from "./hooks/useZoneManager.ts";
import { useEnvManager } from "./hooks/useEnvManager.ts";
import { useBackgroundOps } from "./hooks/useBackgroundOps.ts";
import { useCopyOnSelect } from "./hooks/useCopyOnSelect.ts";
import { useOperationChrome } from "./hooks/useOperationChrome.ts";
import { useDevBuildActions } from "./hooks/useDevBuildActions.ts";
import { useGlobalAppInput } from "./hooks/useGlobalAppInput.ts";
import { useIpcBridge } from "./hooks/useIpcBridge.ts";

// ── Layout / chrome ───────────────────────────────────────────────────────────
import { AppFrame } from "./AppFrame.tsx";
import { AppRoutes } from "./AppRoutes.tsx";

// Utilities
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import type { RuntimeInstance } from "./zone/supabase-factory.ts";
import { PROJECT_DIR } from "../config/stack.ts";
import { devContainerName, startDevContainer, stopDevContainer } from "./dev-container.ts";
import type { Zone } from "../config/zones.ts";
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

  const {
    stackFocused,
    stackManagerOpen,
    setStackManagerOpen,
    toggleStackFocus,
    toggleStackManager,
    handleOverlayQ,
    handleOverlayEsc,
    handleOverlayKill,
    handleOverlayEnter,
    handleOverlayCopy,
    handleOverlayCopyTail,
    handleOverlayRestart,
    handleOverlayPopout,
    handleStackUp,
    handleStackDown,
    handleStackEnter,
    handleStackDismiss,
    handleStackDismissAll,
    handleStackPopout,
    handleStackCopy,
    handleStackCopyTail,
    handleStackClose,
    handleStackHide,
    handleStackManagerClose,
  } = useOperationChrome({
    bgOps,
    setBgOps,
    overlayOpId,
    setOverlayOpId,
    overlayOp,
    stackOpen,
    setStackOpen,
    stackFocusId,
    setStackFocusId,
    logProcRef,
    logOpIdRef,
    copy,
    triggerDismissHook,
    triggerRestartHook,
    registerPopout,
    dismissPopout,
  });

  useIpcBridge({
    view,
    bgOps,
    proxyStatus,
    refreshEnvs,
    runOpQueued,
    coreDockerInstance: CORE_DOCKER_INSTANCE,
  });
  useGlobalAppInput({
    view,
    tokenEditing,
    splashDone,
    hasBackgroundOps: bgOps.length > 0,
    goBack,
    navigateReplace,
    toggleStackFocus,
    toggleStackManager,
  });
  const { handleRelease, handleBuild } = useDevBuildActions({
    runOpQueued,
    addNotification,
  });
  // ── Render ────────────────────────────────────────────────────────────────
  // Everything lives inside AlternateScreen so the TUI occupies the terminal's
  // alt-screen buffer.  This means:
  //   • The renderer uses CSI H (cursor-home) + full/diff paint — no cursor-up
  //     relative moves that break when the user scrolls the main screen.
  //   • The terminal never grows: no new lines are ever appended to the scrollback.
  //   • On exit, the main screen content is fully restored.
  return (
    <AppFrame
      noSplash={noSplash}
      splashDone={splashDone}
      onSplashDone={() => setSplashDone(true)}
      onQuit={() => exit()}
      view={view}
      history={history}
      subCrumbs={subCrumbs}
      bgOps={bgOps}
      overlayOpId={overlayOpId}
      overlayOp={overlayOp}
      stackOpen={stackOpen}
      stackFocused={stackFocused}
      stackFocusId={stackFocusId}
      stackManagerOpen={stackManagerOpen}
      notifications={notifications}
      didCopy={didCopy}
      activeEnvName={activeEnv?.name}
      activeEnvType={activeEnv?.type}
      copy={copy}
      goBack={goBack}
      runCreateZone={runCreateZone}
      onOverlayQ={handleOverlayQ}
      onOverlayEsc={handleOverlayEsc}
      onOverlayKill={handleOverlayKill}
      onOverlayEnter={handleOverlayEnter}
      onOverlayCopy={handleOverlayCopy}
      onOverlayCopyTail={handleOverlayCopyTail}
      onOverlayRestart={handleOverlayRestart}
      onOverlayPopout={handleOverlayPopout}
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
      onStackManagerClose={handleStackManagerClose}
      setStackManagerOpen={setStackManagerOpen}
    >
      <AppRoutes
        view={view}
        zones={zones}
        zoneStatuses={zoneStatuses}
        proxyStatus={proxyStatus}
        anyBusy={anyBusy}
        activeEnv={activeEnv}
        stackFocused={stackFocused}
        infraSource={infraSource}
        envStale={envStale}
        envDataAge={envDataAge}
        infraResults={infraResults}
        infraChecking={infraChecking}
        selectedEnvForDetail={selectedEnvForDetail}
        lastEnvError={lastEnvError}
        coreDockerInstance={CORE_DOCKER_INSTANCE}
        navigate={navigate}
        goBack={goBack}
        copy={copy}
        setTokenEditing={setTokenEditing}
        setZones={setZones}
        setSubCrumbs={setSubCrumbs}
        setSelectedEnvForDetail={setSelectedEnvForDetail}
        addNotification={addNotification}
        runOpQueued={runOpQueued}
        openLogs={openLogs}
        runDevMode={runDevMode}
        forceRefreshZoneList={forceRefreshZoneList}
        checkInfra={checkInfra}
        handleRelease={handleRelease}
        handleBuild={handleBuild}
      />
    </AppFrame>
  );
}
