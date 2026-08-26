// src/ink/zone/delete.ts
// ─────────────────────────────────────────────────────────────────────────────
// deleteZone — fully tear down a zone.
//
// Step order is deliberate — Docker teardown runs BEFORE filesystem deletion
// so the per-zone compose file is still readable when Docker needs it.
//
//   1. Stop container + remove local image  (removeZoneDockerArtifacts)
//   2. Remove zones/{key}/                  (includes docker-compose.yml)
//   3. Remove src/zones/{key}/              (core page module)
//   4. Remove from Supabase zones table
//   5. Remove override from routeClassifier.ts
//   6. Remove route from proxy-config/routes.json
//   7. Remove NPM proxy host                (best-effort, non-blocking)
//
// Root docker-compose.yml is NOT touched for new-style zones.
// Legacy zones still in root compose have their block left in place until
// explicitly migrated — intentional to avoid breaking running containers.
// ─────────────────────────────────────────────────────────────────────────────

import { join }                        from "path";
import { rm }                          from "fs/promises";

import { PROJECT_DIR }                 from "../../config/stack.ts";
import { pathExists }                  from "../../utils/zoneScaffolding.ts";
import { removeZoneDockerArtifacts, syncSharedZonesCompose }   from "../docker.ts";
import { deleteZoneFromDb }            from "./registry.ts";
import { removeFromRouteClassifier }   from "./route-classifier.ts";
import { removeZoneRoute }             from "../proxy-config.ts";
import { deleteZoneNpmHost }           from "./npm-cleanup.ts";
import type { Zone }                   from "../../config/zones.ts";
import type { OnLine }                 from "./types.ts";

export type { OnLine };

type DeleteZoneTarget = Pick<Zone, "key" | "container" | "image">;

export async function deleteZone(
  zone:   DeleteZoneTarget,
  onLine: OnLine,
): Promise<{ exitCode: number }> {
  const { key, container, image } = zone;

  onLine(`Deleting zone: ${key}`);
  onLine("");

  const zoneDir   = join(PROJECT_DIR, "zones", key);
  const coreDir   = join(PROJECT_DIR, "src", "zones", key);

  // 1. Stop container + remove local image.
  //    Must run BEFORE filesystem cleanup (step 2) so:
  //      • New-style zones: per-zone compose file is still readable
  //      • Legacy zones:    root compose still contains the service definition
  //    Failures are non-fatal — container may already be stopped/missing.
  await removeZoneDockerArtifacts(key, container, image, onLine);
  onLine("");

  // 2. Remove zones/{key}/
  if (await pathExists(zoneDir)) {
    await rm(zoneDir, { recursive: true, force: true });
    onLine(`✓ Removed zones/${key}/`);
  } else {
    onLine(`⚠ zones/${key}/ not found — skipping`);
  }

  // 3. Remove src/zones/{key}/
  if (await pathExists(coreDir)) {
    await rm(coreDir, { recursive: true, force: true });
    onLine(`✓ Removed src/zones/${key}/`);
  } else {
    onLine(`⚠ src/zones/${key}/ not found — skipping`);
  }
  onLine("");

  // 4. Remove from Supabase zones table
  await deleteZoneFromDb(key, onLine);

  // 4.5 Synchronize unified zones compose file
  await syncSharedZonesCompose(onLine);

  // 5. Remove override from routeClassifier.ts
  await removeFromRouteClassifier(key, onLine);
  onLine("");

  // 6. Remove route from proxy-config/routes.json.
  //    Proxy hot-reloads in ~150ms — no container restart needed.
  //    Requests for {key}.unenter.live will 502 immediately (correct — zone is gone).
  await removeZoneRoute(key, onLine);

  // 7. Remove NPM proxy host (best-effort).
  //    Any NPM-side failure (offline, creds missing, host already gone) is
  //    logged and swallowed so zone deletion always completes.
  onLine("");
  await deleteZoneNpmHost(key, onLine);

  onLine("");
  onLine(`✓ Zone "${key}" deleted`);

  return { exitCode: 0 };
}
