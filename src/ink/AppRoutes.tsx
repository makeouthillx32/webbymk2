import React, { useState } from "react";
import { WelcomeScreen } from "../screens/WelcomeScreen.js";
import { SettingsScreen } from "../screens/SettingsScreen.js";
import { NotesScreen } from "../screens/NotesScreen.js";
import { AddEnvironmentScreen } from "../screens/AddEnvironmentScreen.js";
import { InstanceWizardScreen } from "../screens/InstanceWizardScreen.tsx";
import { CloneWizardScreen }    from "../screens/CloneWizardScreen.tsx";
import { CoreView } from "./views/CoreView.tsx";
import { ZonesView } from "./views/ZonesView.tsx";
import { NpmPanel } from "./panels/Npm/index.tsx";
import { DbPanel } from "./panels/Db/index.tsx";
import { InfraPanel } from "./panels/Infra/index.tsx";
import { EnvPanel } from "./panels/Env/index.tsx";
import { EnvDetailScreen } from "./panels/Env/EnvDetailScreen.tsx";
import { gracefulShutdownSync } from "../utils/gracefulShutdown.js";
import { snapshotInstance } from "./zone/snapshot.ts";
import {
  startCoreStack,
  stopCoreStack,
  restartCoreStack,
  healCoreStack,
  verifyCoreStack,
  deleteRuntimeInstance,
  reregisterInstanceNpm,
} from "./db-api.ts";
import { createBlankDatabase, cloneFromSnapshot } from "./zone/database-manager.js";
import type { RuntimeInstance } from "./zone/supabase-factory.ts";
import type { SnapshotBundle } from "./zone/snapshot.ts";
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
  coreDockerInstance: import("./zone/supabase-factory.ts").RuntimeInstance;
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
}: AppRoutesProps) {
  // Bundle captured when user picks a snapshot to clone — passed to CloneWizardScreen
  const [cloneBundle, setCloneBundle] = useState<SnapshotBundle | null>(null);

  // Zone key captured when Welcome's [1-9] shortcut fires — consumed once by
  // ZonesView on mount to pre-select + open that zone's action panel, so
  // "go to a zone" from Welcome lands on the zone instead of core.
  const [pendingZoneKey, setPendingZoneKey] = useState<string | null>(null);

  const handleInstanceAction = (action: "restart" | "stop" | "delete" | "snapshot" | "verify" | "npm", inst: RuntimeInstance) => {
    if (action === "snapshot") {
      runOpQueued(`Snapshot ${inst.name}`, async (o) => {
        await snapshotInstance(inst, o);
        return 0;
      }, 'next');
    } else if (action === "restart") {
      runOpQueued(`Restart ${inst.name}`, async (o) => {
        const ok = await restartCoreStack(inst, o);
        return ok ? 0 : 1;
      }, 'now');
    } else if (action === "stop") {
      runOpQueued(`Stop ${inst.name}`, async (o) => {
        const ok = await stopCoreStack(inst, o);
        return ok ? 0 : 1;
      }, 'now');
    } else if (action === "verify") {
      runOpQueued(`Verify ${inst.name}`, async (o) => {
        const report = await verifyCoreStack(inst, o);
        o(`\nOverall: ${report.overall}  (${report.runningCount}/${report.totalCount} running)`);
        return report.overall === "down" ? 1 : 0;
      }, 'later');
    } else if (action === "delete") {
      runOpQueued(`Delete ${inst.name}`, async (o) => {
        const ok = await deleteRuntimeInstance(inst, o);
        return ok ? 0 : 1;
      }, 'now');
    } else if (action === "npm") {
      runOpQueued(`Re-register NPM ${inst.name}`, async (o) => {
        const ok = await reregisterInstanceNpm(inst, o);
        return ok ? 0 : 1;
      }, 'next');
    }
  };

  return (
    <>
      {view === "welcome" && (
        <WelcomeScreen
          zones={zones}
          zoneStatuses={zoneStatuses}
          proxyStatus={proxyStatus}
          busy={anyBusy}
          infraResults={infraResults}
          onManage={() => navigate("core")}
          onSettings={() => navigate("settings")}
          onOpenZone={(key) => { setPendingZoneKey(key); navigate("zones"); }}
          onQuit={() => gracefulShutdownSync(0)}
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
          initialZoneKey={pendingZoneKey}
          onConsumeInitialZoneKey={() => setPendingZoneKey(null)}
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
          onBackup={() => runOpQueued("Snapshot core DB", async (o) => {
            await snapshotInstance(coreDockerInstance, o);
            return 0;
          }, 'next')}
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
          onSubCrumbs={setSubCrumbs}
          onNewInstance={() => navigate("instance-wizard")}
          onInstanceAction={handleInstanceAction}
          onRestore={(bundle, inst) => runOpQueued(`Restore → ${inst.name}`, async (o) => {
            const { restoreInstance } = await import("./zone/snapshot.ts");
            return await restoreInstance(bundle.bundlePath, o, inst) ? 0 : 1;
          }, 'now')}
          onCloneFromSnapshot={(bundle) => { setCloneBundle(bundle); navigate("clone-wizard"); }}
        />
      )}

      {view === "instance-wizard" && (
        <InstanceWizardScreen
          onDeploy={(name) => {
            goBack();
            runOpQueued(`Create instance "${name}"`, async (o) => {
              await createBlankDatabase(name, { registerNpm: true, instanceName: name }, o);
              return 0;
            }, 'now');
          }}
          onCancel={goBack}
        />
      )}

      {view === "clone-wizard" && cloneBundle && (
        <CloneWizardScreen
          bundle={cloneBundle}
          onDeploy={(name) => {
            const bundle = cloneBundle;
            setCloneBundle(null);
            goBack();
            runOpQueued(`Clone → "${name}"`, async (o) => {
              await cloneFromSnapshot(bundle.bundlePath, name, { registerNpm: true }, o);
              return 0;
            }, 'now');
          }}
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
