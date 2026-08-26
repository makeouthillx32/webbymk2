import { useCallback } from "react";
import { startCreation, deleteZone } from "../zone/index.js";
import { pullAndUp, restartZone, reloadProxy, doctorComposeService } from "../docker.js";
import { deployZone, buildAndDeploy, gitPush, buildAll, deployAll } from "../zone-build.js";
import { startDevContainer } from "../dev-container.js";
import { npmAddZone } from "../npm/index.ts";
import { loadEnvironments } from "../environment-store.js";
import { invalidateZoneCache } from "../zone-store.js";
import type { Zone } from "../../config/zones.js";
import type { DerivedZone } from "../zone/index.js";

export function useTuiActions(
  rawRunOp: any,
  _startOp: any,
  openLogs: any,
  refreshStatuses: any,
  addNotification: any,
  reloadZones: any,
  setBgOps: any,
  zones: Zone[]
) {
  const runOp = useCallback(
    (title: string, op: (onLine: (l: string) => void) => Promise<number>) => {
      rawRunOp(title, op, refreshStatuses);
    },
    [rawRunOp, refreshStatuses],
  );

  const runCreateZone = useCallback((zone: DerivedZone) => {
    const { id, addLine: rawAddLine } = _startOp(`Create  ${zone.label}`, false, true);
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

    startCreation(zone, addLine).then((code) => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      lineBuffer.splice(0).forEach(rawAddLine);
      rawAddLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
      setBgOps((prev: any[]) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
      if (code === 0) {
        addNotification(`${zone.label} is live at ${zone.domain} ✓`, "success");
        reloadZones(true);
      } else {
        addNotification(`Create "${zone.label}" failed — check [o] for output`, "error");
      }
      refreshStatuses();
    });
  }, [_startOp, addNotification, reloadZones, refreshStatuses, setBgOps]);

  function executeAction(actionId: string, zone: Zone) {
    switch (actionId) {
      case "deploy": runOp(`Deploy  ${zone.label}`, (o) => deployZone(zone, o)); break;
      case "pull": runOp(`Pull+up  ${zone.label}`, (o) => pullAndUp(zone, o)); break;
      case "restart": runOp(`Restart  ${zone.label}`, (o) => restartZone(zone, o)); break;
      // The [v] Dev mode key showed up in every zone's action menu but had
      // no handler here at all — CoreView.tsx wires the same action id to
      // a richer overlay (runDevMode/runDevModeOp) that's only threaded
      // through for the core zone, so pressing [v] on any real zone
      // (status, tank, blog, ...) silently did nothing. This gives it the
      // same basic-but-working treatment every other action here already
      // gets, rather than leaving it dead.
      case "dev": runOp(`Dev mode  ${zone.label}`, (o) => startDevContainer(zone, o)); break;
      case "build":
        if (!zone.dockerfile) {
          const { addLine } = _startOp(`Build: ${zone.key}`, false, true);
          addLine(`${zone.key} has no Dockerfile — use [p] pull+up instead.`);
          setBgOps((prev: any[]) => prev.map((o: any) => o.title === `Build: ${zone.key}` && o.busy ? { ...o, busy: false } : o));
          break;
        }
        runOp(`Build+deploy  ${zone.label}`, (o) => buildAndDeploy(zone, o));
        break;
      case "rebuild":
        if (!zone.dockerfile) {
          const { addLine } = _startOp(`Rebuild: ${zone.key}`, false, true);
          addLine(`${zone.key} has no Dockerfile — use [p] pull+up instead.`);
          setBgOps((prev: any[]) => prev.map((o: any) => o.title === `Rebuild: ${zone.key}` && o.busy ? { ...o, busy: false } : o));
          break;
        }
        runOp(`Rebuild+deploy  ${zone.label}  (no cache)`, (o) => buildAndDeploy(zone, o, { noCache: true }));
        break;
      case "logs": openLogs(zone.container, zone.label); break;
      case "npm": runOp(`Register NPM  ${zone.domain}`, async (o) => {
        const envs    = await loadEnvironments().catch(() => []);
        const zoneEnv = zone.environmentId ? (envs.find((e) => e.id === zone.environmentId) ?? null) : null;
        return npmAddZone(zone, o, zoneEnv);
      }); break;
      case "doctor":
        runOp(`Fix compose  ${zone.label}`, async (o) => {
          o(`--- doctor: ${zone.label} ---`);
          const changed = doctorComposeService(zone, o);
          if (changed) o(`✓ docker-compose.yml patched — service '${zone.service}' now references ${zone.image}`);
          else o(`✓ compose entry for '${zone.service}' already has image: — no changes needed`);
          o(`✓ compose entry for '${zone.service}' fixed`);
          o(`  Proxy v2 will pick up ${zone.domain} within 5 seconds (no restart needed)`);
          o(`  Next: press [p] Pull + up to redeploy with the correct image`);
          return 0;
        });
        break;
      case "delete": {
        const { label: zLabel, key: zKey } = zone;
        runOp(`Delete zone  ${zKey}`, (o) =>
          deleteZone(zone, o).then((r) => {
            if (r.exitCode === 0) {
              addNotification(`"${zLabel}" zone deleted`, "success");
              invalidateZoneCache();
              reloadZones(true);
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

  return { runOp, runCreateZone, executeAction };
}
