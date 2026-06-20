// src/ink/zone-pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone creation pipeline — pure async helpers with no React dependencies.
//
// Steps (sequential — any non-zero exit code halts the chain):
//   1  scaffold     create files + compose + register in DB + write proxy route
//   2  build+push   docker build → GHCR
//   3  deploy       docker compose pull + up
//   4  wait         poll container until healthy
//   5  NPM cert     create proxy host + Let's Encrypt cert
//
// Proxy routing is handled automatically: scaffoldZone() writes the new zone
// into proxy-config/routes.json and the running proxy hot-reloads in ~150ms —
// no docker restart ever needed.
//
// repairZonePipeline() re-syncs the proxy route + NPM host — useful when a
// zone is live but routing to the wrong upstream.
//
// Called by useBackgroundOps.runCreateZone — output lines are streamed back
// via the onLine callback so they appear in the DetachedStack overlay in
// real time.
// ─────────────────────────────────────────────────────────────────────────────

import { getStatus, pullAndUp, ensureZoneNetwork, reloadProxy } from "./docker.ts";
import { buildZone }                         from "./zone-build.ts";
import { npmAddZone, deriveNpmUpstream }     from "./npm/index.ts";
import { scaffoldZone, deleteZone }          from "./zone-scaffold.ts";
import type { DerivedZone }                  from "./zone-scaffold.ts";
import { addZoneRoute, getRoutes, deriveZoneUpstream } from "./proxy-config.ts";
import { loadEnvironments }                  from "./environment-store.ts";
import type { UnaxisEnvironment }            from "./environment-store.ts";

// ── Wait for container health ─────────────────────────────────────────────────

const WAIT_TIMEOUT_MS  = 3 * 60_000;
const WAIT_INTERVAL_MS = 4_000;

export async function waitForZone(
  container: string,
  onLine:    (l: string) => void,
): Promise<number> {
  const start = Date.now();
  let   dots  = 0;

  onLine(`Polling ${container} for healthy status…`);

  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    const status = await getStatus(container);
    dots++;

    if (status === "running" || status === "healthy") {
      onLine(`✓ Container is live  (${status})`);
      return 0;
    }

    onLine(`  [${dots}] ${status === "missing" ? "not started yet" : status}…`);
    await new Promise<void>((r) => setTimeout(r, WAIT_INTERVAL_MS));
  }

  onLine(`✗ Timed out waiting for ${container}`);
  return 1;
}

// ── Rollback helper ───────────────────────────────────────────────────────────
//
// Called after scaffold succeeds but a later step fails.
// deleteZone() is already graceful about missing containers / NPM hosts / DB
// rows — so this is always safe to call even for partially-created zones.

async function rollbackZone(
  zone:   DerivedZone,
  onLine: (l: string) => void,
): Promise<void> {
  onLine(`\n── rollback ──`);
  onLine(`  Cleaning up "${zone.key}" scaffold artifacts…`);
  try {
    await deleteZone(zone, onLine);
    onLine(`✓ Rollback complete — zone "${zone.key}" removed cleanly`);
  } catch (err) {
    onLine(`⚠ Rollback hit an error: ${err}`);
    onLine(`  If files remain, run the delete action on "${zone.key}" manually.`);
  }
}

// ── Full 6-step creation pipeline ─────────────────────────────────────────────
//
// Rollback policy:
//   Step 1 (scaffold)   — failure here returns early; nothing to roll back.
//   Step 2 (build)      — failure triggers rollback (scaffold artefacts exist).
//   Step 3 (deploy)     — failure triggers rollback (scaffold artefacts exist,
//                          container may be partially started).
//   Steps 4–6           — zone is already running; failures are non-fatal.
//                          NPM cert / proxy issues can be fixed via [f] doctor.

export async function createZonePipeline(
  zone:       DerivedZone,
  onLine:     (l: string) => void,
  dockerUrl?: string,
): Promise<number> {
  const step = (name: string) => onLine(`\n── ${name} ──`);

  // 1 — Scaffold + DB register + proxy route
  step("scaffold");
  const scaffoldResult = await scaffoldZone(zone, onLine);
  if (scaffoldResult.exitCode !== 0) return 1;

  // ── Steps 2–3: any failure rolls back the scaffold ──────────────────────────

  // 2 — Build + push image to GHCR
  step("build & push");
  const buildCode = await buildZone(zone, onLine);
  if (buildCode !== 0) {
    onLine(`✗ Build failed (exit ${buildCode})`);
    await rollbackZone(zone, onLine);
    return buildCode;
  }

  // 3 — docker compose pull + up
  step("deploy");
  // Pre-flight: ensure the shared 'unenter' Docker network exists.
  // Self-heals the legacy webbymk2_unenter → unenter rename if needed.
  const networkReady = await ensureZoneNetwork(onLine);
  if (!networkReady) {
    onLine(`✗ Docker network setup failed`);
    await rollbackZone(zone, onLine);
    return 1;
  }
  // Skip the proxy reload that pullAndUp normally chains — this pipeline
  // does its own proxy reload at step 6, AFTER NPM registration writes the
  // route into routes.json, so the proxy picks up zone + route in one go.
  const deployCode = await pullAndUp(zone, onLine, dockerUrl, { skipProxyReload: true });
  if (deployCode !== 0) {
    onLine(`✗ Deploy failed (exit ${deployCode})`);
    await rollbackZone(zone, onLine);
    return deployCode;
  }

  // ── Steps 4–6: zone is live — failures are non-fatal, no rollback ───────────

  // 4 — Wait for container health
  step("wait for live");
  const waitCode = await waitForZone(zone.container, onLine);
  if (waitCode !== 0) {
    onLine(`⚠ Health check timed out — proceeding to NPM registration anyway`);
    onLine(`  Use [f] Fix routing on this zone if it stays unreachable.`);
  }

  // 5 — NPM proxy host + Let's Encrypt cert
  step("NPM cert");
  const envs = await loadEnvironments().catch(() => [] as UnaxisEnvironment[]);
  const zoneEnv = zone.environmentId
    ? (envs.find((e) => e.id === zone.environmentId) ?? null)
    : null;
  await npmAddZone(zone, onLine, zoneEnv);

  // 6 — Restart proxy so the new route is live immediately.
  //     routes.json hot-reload via fs.watch is unreliable on Windows/Docker
  //     (inotify events don't cross the NTFS→Linux container boundary).
  //     A restart is instant (<3s), guaranteed, and runs as the final step
  //     so it never delays the build or deploy phases.
  step("proxy restart");
  await reloadProxy(onLine);

  return 0;
}

// ── Repair pipeline (route sync + NPM cert) ───────────────────────────────────
// Run when a zone is already live but routing to the wrong upstream.
// Syncs the proxy route in routes.json (hot-reload in ~150ms) and re-verifies
// the NPM proxy host forward target.

export async function repairZonePipeline(
  zone:   DerivedZone,
  onLine: (l: string) => void,
): Promise<number> {
  const step = (name: string) => onLine(`\n── ${name} ──`);

  step("sync proxy route");
  const repairEnvs = await loadEnvironments().catch(() => [] as UnaxisEnvironment[]);
  const repairEnv  = zone.environmentId
    ? (repairEnvs.find((e) => e.id === zone.environmentId) ?? null)
    : null;
  try {
    const upstream = deriveZoneUpstream(zone, repairEnv);
    const before   = getRoutes();
    const already  = before.zones[zone.key] === upstream;
    if (!already) {
      addZoneRoute(zone.key, upstream, onLine);
      onLine(`✓ Route written  →  ${zone.domain}  →  ${upstream}`);
      onLine(`  Proxy hot-reloads in ~150ms — no restart needed.`);
    } else {
      onLine(`✓ Route already correct  →  ${zone.domain}  →  ${upstream}`);
    }
  } catch (err) {
    onLine(`✗ Failed to sync proxy route: ${err}`);
  }

  step("verify NPM");
  await npmAddZone(zone, onLine, repairEnv);

  return 0;
}
