// src/ink/zone/scaffold.ts
// ─────────────────────────────────────────────────────────────────────────────
// scaffoldZone — create all files and register a new zone.
//
//   1. Guard: zone directory must not already exist
//   2. Create directory tree (zones/{key}/src/app/ + src/zones/{key}/)
//   3. Write core page module (src/zones/{key}/Page.tsx)
//   4. Write zone files: Dockerfile, package.json, page.tsx, layout.tsx
//   5. Write dynamic section wrappers + core starters (zone-managed only)
//   6. Register in Supabase zones table
//   7. Patch routeClassifier.ts with layout override
//   8. Write per-zone docker-compose.yml
//   9. Register route in proxy-config/routes.json
// ─────────────────────────────────────────────────────────────────────────────

import { join }                from "path";
import { existsSync }          from "fs";
import { mkdir }               from "fs/promises";

import { PROJECT_DIR, ARTIFACT_STORE_DIR } from "../../config/stack.ts";
import { pathExists, writeFileAtomic } from "../../utils/zoneScaffolding.ts";
import {
  genDockerfile, genPackageJson, genPageTsx,
  genLayoutTsx, genCorePageModule,
  genDsWrappers, genDsCorePageTsx,
  genZoneCompose, genBuildEnv,
}                              from "../zone-templates.ts";
import { insertZoneToDb }      from "./registry.ts";
import { patchRouteClassifier } from "./route-classifier.ts";
import { addZoneRoute }        from "../proxy-config.ts";
import { deriveZone, findNextDevPort } from "./derive.ts";
import type { DerivedZone, NewZoneParams, OnLine } from "./types.ts";

export type { OnLine };

/**
 * Scaffold a new zone from either:
 *   • NewZoneParams  — port auto-detected via findNextDevPort()
 *   • DerivedZone    — already fully resolved (use this from the wizard so
 *                      the port shown in the confirm step matches what's used)
 */
export async function scaffoldZone(
  params: NewZoneParams | DerivedZone,
  onLine: OnLine,
): Promise<{ zone: DerivedZone; exitCode: number }> {
  const z: DerivedZone = "domain" in params
    ? params
    : deriveZone(params, await findNextDevPort());

  const zoneDir      = join(PROJECT_DIR, "zones", z.key);
  const appDir       = join(zoneDir, "src", "app");
  const coreZonesDir = join(PROJECT_DIR, "src", "zones", z.key);

  onLine(`Zone     →  ${z.key}  (${z.label})`);
  onLine(`Domain   →  ${z.domain}`);
  onLine(`Layout   →  ${z.layoutType}${z.layoutType === "app" ? `  footer: ${z.appFooter}` : ""}`);
  onLine(`Dev port →  :${z.devPort}`);
  onLine("");

  // ── Guard: already exists ────────────────────────────────────────────────
  if (await pathExists(zoneDir)) {
    onLine(`✗ zones/${z.key}/ already exists — choose a different key`);
    return { zone: z, exitCode: 1 };
  }

  // ── Create directory tree ────────────────────────────────────────────────
  onLine(`Creating zones/${z.key}/...`);
  await mkdir(appDir,       { recursive: true });
  await mkdir(coreZonesDir, { recursive: true });
  onLine(`✓ zones/${z.key}/src/app/`);
  onLine(`✓ src/zones/${z.key}/`);

  // ── Write core page module (src/zones/{key}/Page.tsx) ───────────────────
  await writeFileAtomic(join(coreZonesDir, "Page.tsx"), genCorePageModule(z));
  const usingTemplate = existsSync(
    join(PROJECT_DIR, "src", "ink", "templates", "zone", "pages", "zone-starter.tsx")
  );
  onLine(`✓ src/zones/${z.key}/Page.tsx  ${usingTemplate ? "(from template)" : "(minimal fallback)"}`);

  // ── Write zone files ─────────────────────────────────────────────────────
  await writeFileAtomic(join(zoneDir, "Dockerfile"),   genDockerfile(z));
  onLine(`✓ Dockerfile  (${z.layoutType} layout, layout-aware core dirs)`);

  await writeFileAtomic(join(zoneDir, "package.json"), genPackageJson(z));
  onLine(`✓ package.json  (dev port :${z.devPort})`);

  await writeFileAtomic(join(zoneDir, "build.env"),    genBuildEnv(z));
  onLine(`✓ build.env  (build-time NEXT_PUBLIC_* manifest — safe to commit)`);

  await writeFileAtomic(join(appDir, "page.tsx"),      genPageTsx(z));
  onLine(`✓ zones/${z.key}/src/app/page.tsx  (re-export wrapper)`);

  await writeFileAtomic(join(appDir, "layout.tsx"),    genLayoutTsx(z));
  onLine(`✓ zones/${z.key}/src/app/layout.tsx`);
  onLine(`  (globals.css: inherited from core at build time — no zone copy needed)`);

  onLine("");

  // ── Dynamic sections (DS) ────────────────────────────────────────────────
  //
  // hasCore:true  → skip. The Dockerfile's layout-aware `for dir` loop already
  //                 preserves them from the core app. Generating wrapper files
  //                 would cause a circular import at Next.js compile time.
  // hasCore:false → zone-managed. Scaffold wrapper + core starter.

  if (z.dynamicSections.length > 0) {
    const coreManagedDs = z.dynamicSections.filter((ds) =>  ds.hasCore);
    const zoneManagedDs = z.dynamicSections.filter((ds) => !ds.hasCore);

    if (coreManagedDs.length > 0) {
      onLine(`Core-managed routes (preserved by Dockerfile — no zone files needed):`);
      for (const ds of coreManagedDs) {
        onLine(`  → ${ds.routePath}  (inherited from core)`);
      }
      onLine("");
    }

    if (zoneManagedDs.length > 0) {
      onLine(`Creating ${zoneManagedDs.length} zone-managed dynamic section(s)...`);
      for (const ds of zoneManagedDs) {
        const wrapperDir = join(appDir,       ds.routePath);
        const coreDir    = join(coreZonesDir, ds.routePath);
        await mkdir(wrapperDir, { recursive: true });
        await mkdir(coreDir,    { recursive: true });

        const wrappers = genDsWrappers(z, ds);
        for (const [filename, content] of Object.entries(wrappers)) {
          await writeFileAtomic(join(wrapperDir, filename), content);
        }
        await writeFileAtomic(join(coreDir, "Page.tsx"), genDsCorePageTsx(z, ds));
        onLine(`✓ DS: ${ds.routePath}  (wrappers + core starter)`);
      }
      onLine("");
    }
  }

  // ── Register in Supabase zones table ────────────────────────────────────
  await insertZoneToDb(z, onLine);

  // ── Patch routeClassifier.ts ─────────────────────────────────────────────
  await patchRouteClassifier(z, onLine);

  // ── Write managed compose artifact ───────────────────────────────────────
  // The compose file is a managed artifact — it lives outside the repo in the
  // UNAXIS artifact store, not in the source tree.  This mirrors Portainer's
  // /data/compose/{stack_id}/ pattern: the control plane owns compose state,
  // the Git checkout stays clean.
  const artifactDir  = join(ARTIFACT_STORE_DIR, z.key);
  const artifactPath = join(artifactDir, "docker-compose.yml");
  await mkdir(artifactDir, { recursive: true });
  await writeFileAtomic(artifactPath, genZoneCompose(z));
  onLine(`✓ Created artifact store: stacks/${z.key}/docker-compose.yml`);

  // ── Register route in proxy-config/routes.json ───────────────────────────
  // Proxy hot-reloads the file via fs.watch — no container restart needed.
  await addZoneRoute(z.key, `http://${z.service}:3000`, onLine);

  onLine("");
  onLine(`✓ Zone "${z.key}" scaffolded — pipeline will build, deploy, and cert automatically`);

  return { zone: z, exitCode: 0 };
}
