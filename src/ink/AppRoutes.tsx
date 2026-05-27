import React from "react";
import { WelcomeScreen } from "../screens/WelcomeScreen.js";
import { SettingsScreen } from "../screens/SettingsScreen.js";
import { InstanceWizardScreen } from "../screens/InstanceWizardScreen.js";
import { CloneWizardScreen }    from "../screens/CloneWizardScreen.js";
import { NotesScreen } from "../screens/NotesScreen.js";
import { AddEnvironmentScreen } from "../screens/AddEnvironmentScreen.js";
import { CoreView } from "./views/CoreView.tsx";
import { ZonesView } from "./views/ZonesView.tsx";
import { NpmPanel } from "./panels/Npm/index.tsx";
import { DbPanel } from "./panels/Db/index.tsx";
import { InfraPanel } from "./panels/Infra/index.tsx";
import { EnvPanel } from "./panels/Env/index.tsx";
import { EnvDetailScreen } from "./panels/Env/EnvDetailScreen.tsx";
import { gracefulShutdownSync } from "../utils/gracefulShutdown.js";
import { backupDatabase } from "./db-api.ts";
import {
  startCoreStack,
  stopCoreStack,
  restartCoreStack,
  healCoreStack,
  verifyCoreStack,
  deleteRuntimeInstance,
  reregisterInstanceNpm,
} from "./db-api.ts";
import {
  snapshotInstance,
  restoreInstance,
} from "./zone/snapshot.ts";
import type { RuntimeInstance } from "./zone/supabase-factory.ts";

type AppRoutesProps = {
  view: string;
  zones: any[];
  zoneStatuses: Record<string, any>;
  proxyStatus: any;
  anyBusy: boolean;
  activeEnv: any;
  stackFocused: boolean;
  infraSource: any;
  envStale: boolean;
  envDataAge: number | null;
  infraResults: any;
  infraChecking: boolean;
  selectedEnvForDetail: any;
  lastEnvError: string | null;
  coreDockerInstance: RuntimeInstance;
  navigate: (view: any) => void;
  goBack: () => void;
  copy: (value: string) => void;
  setTokenEditing: (value: boolean) => void;
  setZones: (zones: any) => void;
  setSubCrumbs: (crumbs: string[]) => void;
  setSelectedEnvForDetail: (env: any) => void;
  addNotification: (message: string, tone?: any) => void;
  runOpQueued: (title: string, run: (onLine: (line: string) => void) => Promise<number> | number, priority?: any) => void;
  openLogs: (zone: any) => void;
  runDevMode: (zone: any) => void;
  forceRefreshZoneList: () => void;
  checkInfra: () => void;
  handleRelease: () => void;
  handleBuild: () => void;
};

export function AppRoutes({
  view,
  zones,
  zoneStatuses,
  proxyStatus,
  anyBusy,
  activeEnv,
  stackFocused,
  infraSource,
  envStale,
  envDataAge,
  infraResults,
  infraChecking,
  selectedEnvForDetail,
  lastEnvError,
  coreDockerInstance,
  navigate,
  goBack,
  copy,
  setTokenEditing,
  setZones,
  setSubCrumbs,
  setSelectedEnvForDetail,
  addNotification,
  runOpQueued,
  openLogs,
  runDevMode,
  forceRefreshZoneList,
  checkInfra,
  handleRelease,
  handleBuild,
}: AppRoutesProps) {
  // Clone wizard state — holds the bundle to clone from while navigating
  const [cloneBundle, setCloneBundle] = React.useState<import("./zone/snapshot.ts").SnapshotBundle | null>(null);

  return (
    <>
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
          onStart={() => runOpQueued("Start core stack", async (o) => {
            const ok = await startCoreStack(coreDockerInstance, o);
            return ok ? 0 : 1;
          }, 'now')}
          onStop={() => runOpQueued("Stop core stack", async (o) => {
            const ok = await stopCoreStack(coreDockerInstance, o);
            return ok ? 0 : 1;
          }, 'now')}
          onRestart={() => runOpQueued("Restart core stack", async (o) => {
            const ok = await restartCoreStack(coreDockerInstance, o);
            return ok ? 0 : 1;
          }, 'next')}
          onHeal={() => runOpQueued("Heal core stack", async (o) => {
            const ok = await healCoreStack(coreDockerInstance, o);
            return ok ? 0 : 1;
          }, 'now')}
          onVerify={() => runOpQueued("Verify core stack", async (o) => {
            const report = await verifyCoreStack(coreDockerInstance, o);
            o(`\nOverall: ${report.overall}  (${report.runningCount}/${report.totalCount} running)`);
            return report.overall === "down" ? 1 : 0;
          }, 'later')}
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
            } else if (action === "npm") {
              runOpQueued(`NPM register ${inst.name}`, async (o) => {
                const ok = await reregisterInstanceNpm(inst, o);
                return ok ? 0 : 1;
              }, 'later');
            }
          }}
          onRestore={(bundle, inst) => runOpQueued(
            `Restore ${inst.name} <- ${bundle.id}`,
            async (o) => {
              await restoreInstance(bundle.bundlePath, o);
              return 0;
            },
            'next',
          )}
          onNewInstance={() => navigate("instance-wizard")}
          onCloneFromSnapshot={(bundle) => {
            setCloneBundle(bundle);
            navigate("clone-wizard");
          }}
          onSubCrumbs={setSubCrumbs}
        />
      )}

      {view === "instance-wizard" && (
        <InstanceWizardScreen
          onDone={(_inst) => { goBack(); }}
          onCancel={goBack}
        />
      )}

      {view === "clone-wizard" && cloneBundle && (
        <CloneWizardScreen
          bundle={cloneBundle}
          onDone={(_inst) => { setCloneBundle(null); goBack(); }}
          onCancel={() => { setCloneBundle(null); goBack(); }}
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
    </>
  );
}
