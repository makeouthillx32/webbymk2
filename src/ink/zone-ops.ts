// src/ink/zone-ops.ts
// ─────────────────────────────────────────────────────────────────────────────
// Standalone zone operations that can be invoked individually from the TUI,
// outside of the full scaffoldZone() / deleteZone() pipeline.
//
// These complement zone-scaffold.ts by providing surgical, per-zone actions
// that are useful on already-existing zones:
//
//   getZoneLayout           — detect layout type from routeClassifier.ts
//   getInstalledSections    — scan filesystem to see which DS are present
//   scaffoldDynamicSection  — add a single DS to an existing zone
//   removeDynamicSection    — remove a single DS from an existing zone
//   fixDsErrorWrappers      — ensure every error.tsx starts with "use client"
//   zoneToDerived           — lightweight Zone → DerivedZone conversion
// ─────────────────────────────────────────────────────────────────────────────

import { join }                      from "path";
import { existsSync, readFileSync }  from "fs";
import { mkdir, rm, readFile, writeFile } from "fs/promises";

import { PROJECT_DIR }               from "../config/stack.ts";
import { writeFileAtomic }           from "../utils/zoneScaffolding.ts";
import type { Zone }                 from "../config/zones.ts";
import {
  DS_CATALOG, LAYOUT_OPTIONS,
  genDsWrappers, genDsCorePageTsx,
  type DerivedZone, type DynamicSection, type LayoutType, type OnLine,
} from "./zone-scaffold.ts";

// ── Zone → DerivedZone shim ───────────────────────────────────────────────────
//
// The DS generators only need key, label, domain from DerivedZone.
// Constructing a full DerivedZone from a Zone lets us reuse them without
// touching the generator signatures.

export function zoneToDerived(zone: Zone, layout: LayoutType): DerivedZone {
  return {
    key:             zone.key,
    label:           zone.label,
    layoutType:      layout,
    appFooter:       "none",
    domain:          zone.domain,
    service:         zone.service,
    container:       zone.container,
    image:           zone.image,
    dockerfile:      zone.dockerfile ?? "",
    upstreamEnvKey:  zone.upstreamEnvKey,
    devPort:         0,          // not needed for DS file generation
    dynamicSections: [],
  };
}

// ── Detect layout type ────────────────────────────────────────────────────────

/**
 * Read the zone's layout type from the comment block injected by
 * genRouteOverride() in zone-scaffold.ts.  Returns null for legacy zones
 * that pre-date the comment format.
 *
 * The comment written by genRouteOverride looks like:
 *   // NEXT_PUBLIC_ZONE=shop — layout: shop
 *   // NEXT_PUBLIC_ZONE=myapp — layout: app  footer: none
 */
export function getZoneLayout(zoneKey: string): LayoutType | null {
  const classifierPath = join(
    PROJECT_DIR, "src", "components", "Layouts", "routeClassifier.ts"
  );
  if (!existsSync(classifierPath)) return null;

  const content = readFileSync(classifierPath, "utf-8");
  const match   = content.match(
    new RegExp(`NEXT_PUBLIC_ZONE=${zoneKey}\\s+[—-]\\s+layout:\\s+(\\S+)`)
  );
  if (!match) return null;

  const candidate = match[1] as LayoutType;
  const validTypes = LAYOUT_OPTIONS.map((o) => o.type);
  return validTypes.includes(candidate) ? candidate : null;
}

// ── Scan installed sections ───────────────────────────────────────────────────

/**
 * Return the set of DS ids currently installed in a zone by checking whether
 * the expected wrapper directory exists for each catalog entry.
 *
 * Pass layoutType (from getZoneLayout) to narrow to the right catalog;
 * omit it to scan across all layouts (useful for legacy/unknown zones).
 */
export function getInstalledSections(
  zoneKey:    string,
  layoutType?: LayoutType | null,
): Set<string> {
  const zoneAppDir = join(PROJECT_DIR, "zones", zoneKey, "src", "app");
  const coreAppDir = join(PROJECT_DIR, "src", "app");
  const catalog    = layoutType
    ? (DS_CATALOG[layoutType] ?? [])
    : (Object.values(DS_CATALOG).flat() as DynamicSection[]);

  const installed = new Set<string>();
  for (const ds of catalog) {
    if (ds.hasCore) {
      // Core-managed: always present if the core app has the route directory.
      // These can't be toggled by zone management — they're shown in the UI
      // as permanently installed but not editable.
      const coreDir = join(coreAppDir, ...ds.routePath.split("/"));
      if (existsSync(coreDir)) installed.add(ds.id);
    } else {
      // Zone-managed: check the zone's own app directory.
      const dsDir = join(zoneAppDir, ...ds.routePath.split("/"));
      if (existsSync(dsDir)) installed.add(ds.id);
    }
  }
  return installed;
}

// ── Add one dynamic section ───────────────────────────────────────────────────

/**
 * Scaffold a single dynamic section into an already-existing zone.
 * Creates the wrapper files in zones/{key}/src/app/{ds.routePath}/
 * and a starter core module in src/zones/{key}/{ds.routePath}/Page.tsx.
 * Safe to re-run: skips if the directory is already present.
 */
export async function scaffoldDynamicSection(
  zone:   DerivedZone,
  ds:     DynamicSection,
  onLine: OnLine,
): Promise<void> {
  // hasCore sections live entirely in the core app — the Dockerfile preserves
  // them automatically.  Generating zone wrapper files would cause a circular
  // import at Next.js compile time (the wrapper would overwrite the core file
  // it's trying to re-export from).
  if (ds.hasCore) {
    onLine(`→ ${ds.routePath}  (core-managed — no zone files needed)`);
    return;
  }

  const appDir     = join(PROJECT_DIR, "zones",        zone.key, "src", "app");
  const coreDir    = join(PROJECT_DIR, "src", "zones", zone.key);
  const wrapperDir = join(appDir,  ...ds.routePath.split("/"));
  const coreSubDir = join(coreDir, ...ds.routePath.split("/"));

  if (existsSync(wrapperDir)) {
    onLine(`⚠ ${ds.routePath} already exists in zones/${zone.key} — skipping`);
    return;
  }

  await mkdir(wrapperDir, { recursive: true });
  await mkdir(coreSubDir, { recursive: true });

  const wrappers = genDsWrappers(zone, ds);
  for (const [filename, content] of Object.entries(wrappers)) {
    await writeFileAtomic(join(wrapperDir, filename), content);
  }

  await writeFileAtomic(join(coreSubDir, "Page.tsx"), genDsCorePageTsx(zone, ds));
  onLine(`✓ Added DS: ${ds.routePath}  (${ds.label})`);
}

// ── Remove one dynamic section ────────────────────────────────────────────────

/**
 * Remove a single dynamic section from an already-existing zone.
 * Deletes zones/{key}/src/app/{ds.routePath}/ (wrapper) and
 *          src/zones/{key}/{ds.routePath}/     (core starter).
 * Non-fatal if either directory is missing.
 */
export async function removeDynamicSection(
  zoneKey: string,
  ds:      DynamicSection,
  onLine:  OnLine,
): Promise<void> {
  if (ds.hasCore) {
    onLine(`⚠ ${ds.routePath} is core-managed — cannot be removed via zone management`);
    return;
  }

  const appDir     = join(PROJECT_DIR, "zones",        zoneKey, "src", "app");
  const coreDir    = join(PROJECT_DIR, "src", "zones", zoneKey);
  const wrapperDir = join(appDir,  ...ds.routePath.split("/"));
  const coreSubDir = join(coreDir, ...ds.routePath.split("/"));

  if (existsSync(wrapperDir)) {
    await rm(wrapperDir, { recursive: true, force: true });
    onLine(`✓ Removed wrapper: zones/${zoneKey}/src/app/${ds.routePath}/`);
  } else {
    onLine(`⚠ zones/${zoneKey}/src/app/${ds.routePath}/ not found — skipping`);
  }

  if (existsSync(coreSubDir)) {
    await rm(coreSubDir, { recursive: true, force: true });
    onLine(`✓ Removed core:    src/zones/${zoneKey}/${ds.routePath}/`);
  }
}

// ── Fix error.tsx "use client" ────────────────────────────────────────────────

/**
 * Walk every DS wrapper directory for a zone and ensure error.tsx starts with
 * "use client".  Next.js requires all error.tsx files to be Client Components.
 * Idempotent — safe to run multiple times.
 */
export async function fixDsErrorWrappers(
  zone:   DerivedZone,
  onLine: OnLine,
): Promise<void> {
  const layoutType = getZoneLayout(zone.key);
  const catalog    = layoutType ? (DS_CATALOG[layoutType] ?? []) : [];

  if (catalog.length === 0) {
    onLine(`⚠ No DS catalog found for layout "${layoutType ?? "unknown"}" — nothing to fix`);
    return;
  }

  let fixed = 0;
  for (const ds of catalog) {
    const errorPath = join(
      PROJECT_DIR, "zones", zone.key, "src", "app",
      ...ds.routePath.split("/"), "error.tsx"
    );
    if (!existsSync(errorPath)) continue;

    const src = await readFile(errorPath, "utf-8");
    if (src.trimStart().startsWith('"use client"')) {
      onLine(`  ✓ ${ds.routePath}/error.tsx  (already correct)`);
      continue;
    }
    await writeFile(errorPath, `"use client";\n${src}`, "utf-8");
    onLine(`  ✓ Fixed ${ds.routePath}/error.tsx`);
    fixed++;
  }

  if (fixed > 0) {
    onLine(`\n✓ Patched ${fixed} error.tsx file(s) — rebuild the zone to apply`);
  } else {
    onLine(`✓ All error.tsx files already correct`);
  }
}
