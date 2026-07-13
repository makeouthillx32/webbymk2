// src/ink/zone/registry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone registry operations.
//
// Zone topology is stored in the local SQLite control-plane DB (control.db).
// Lifecycle writes are mirrored to core Supabase public.zones so the
// dashboard's Sites & Apps manager stays in sync with UNAXIS.
//
// On INSERT we also:
//   1. Look up the default-target environment and link via environment_id.
//
// NOTE: managed_stacks is deferred — the active-active architecture plan will
// replace it with zones.environment_id (already present).  See vault note:
//   vault/Brain/synthesis-active-active-architecture.md
// ─────────────────────────────────────────────────────────────────────────────

import type { DerivedZone, OnLine } from "./types.ts";
import {
  dbUpsertZone,
  dbDeleteZone,
  dbGetEnvironments,
  dbGetAllZones,
} from "../control-db.ts";
import { invalidateZoneCache } from "../zone-store.ts";
import {
  ensureRuntimeEnv,
  getRuntimeKongUrl,
  getRuntimeServiceKey,
} from "../../utils/runtimeEnv.js";

function catalogConfig() {
  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl().replace(/\/+$/, "");
  const serviceKey = getRuntimeServiceKey();
  if (!serviceKey) {
    throw new Error(
      "SERVICE_ROLE_KEY not loaded; cannot synchronize public.zones",
    );
  }
  return { kongUrl, serviceKey };
}

function catalogHeaders(
  serviceKey: string,
  prefer?: string,
): Record<string, string> {
  const result: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (prefer) result.Prefer = prefer;
  return result;
}

const keyFilter = (key: string) => `eq.${encodeURIComponent(key)}`;

type ZoneCatalogAssets = {
  og_image_bucket: string | null;
  og_image_path: string | null;
  site_icon_bucket: string | null;
  site_icon_path: string | null;
};

const SITE_ICON_FILES = [
  "icon-32.png",
  "apple-touch-icon-180.png",
  "icon-192.png",
  "icon-512.png",
] as const;

async function fetchZoneCatalogAssets(
  key: string,
  kongUrl: string,
  serviceKey: string,
): Promise<ZoneCatalogAssets | null> {
  const response = await fetch(
    `${kongUrl}/rest/v1/zones?key=${keyFilter(key)}&select=og_image_bucket,og_image_path,site_icon_bucket,site_icon_path&limit=1`,
    { headers: catalogHeaders(serviceKey) },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase zone asset read failed (${response.status}): ${await response.text()}`,
    );
  }
  const rows = (await response.json()) as ZoneCatalogAssets[];
  return rows[0] ?? null;
}

async function deleteCatalogDependents(
  key: string,
  kongUrl: string,
  serviceKey: string,
): Promise<void> {
  const targets = [
    ["zone_deployments", "zone_key"],
    ["zone_endpoint_status", "zone_key"],
    ["zone_endpoint_checks", "zone_key"],
  ] as const;

  for (const [table, column] of targets) {
    const response = await fetch(
      `${kongUrl}/rest/v1/${table}?${column}=${keyFilter(key)}`,
      {
        method: "DELETE",
        headers: catalogHeaders(serviceKey, "return=minimal"),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Supabase ${table} cleanup failed (${response.status}): ${await response.text()}`,
      );
    }
  }
}

async function deleteZoneStorageAssets(
  assets: ZoneCatalogAssets | null,
  kongUrl: string,
  serviceKey: string,
): Promise<void> {
  if (!assets) return;

  const objectsByBucket = new Map<string, string[]>();
  const addObject = (bucket: string | null, path: string | null) => {
    if (!bucket || !path) return;
    const paths = objectsByBucket.get(bucket) ?? [];
    paths.push(path);
    objectsByBucket.set(bucket, paths);
  };

  addObject(assets.og_image_bucket, assets.og_image_path);
  if (assets.site_icon_bucket && assets.site_icon_path) {
    const prefix = assets.site_icon_path.replace(/\/+$/, "");
    for (const fileName of SITE_ICON_FILES) {
      addObject(assets.site_icon_bucket, `${prefix}/${fileName}`);
    }
  }

  for (const [bucket, prefixes] of objectsByBucket) {
    const response = await fetch(
      `${kongUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,
      {
        method: "DELETE",
        headers: catalogHeaders(serviceKey),
        body: JSON.stringify({ prefixes }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Supabase Storage cleanup failed (${response.status}): ${await response.text()}`,
      );
    }
  }
}

async function synchronizeZoneCatalog(
  zone: DerivedZone,
  sortOrder: number,
  environmentId: string | null,
): Promise<void> {
  const { kongUrl, serviceKey } = catalogConfig();
  const syncedAt = new Date().toISOString();

  // Seed a new row without overwriting dashboard-owned presentation fields.
  const insert = await fetch(`${kongUrl}/rest/v1/zones?on_conflict=key`, {
    method: "POST",
    headers: catalogHeaders(
      serviceKey,
      "resolution=ignore-duplicates,return=minimal",
    ),
    body: JSON.stringify({
      key: zone.key,
      label: zone.label,
      domain: zone.domain,
      service: zone.service,
      container: zone.container,
      image: zone.image,
      dockerfile: zone.dockerfile,
      upstream_env_key: zone.upstreamEnvKey,
      sort_order: sortOrder,
      enabled: true,
      environment_id: environmentId,
      source: "unaxis",
      last_synced_at: syncedAt,
    }),
  });
  if (!insert.ok) {
    throw new Error(
      `Supabase zone insert failed (${insert.status}): ${await insert.text()}`,
    );
  }

  // Refresh only the operational fields owned by UNAXIS.
  const update = await fetch(
    `${kongUrl}/rest/v1/zones?key=${keyFilter(zone.key)}`,
    {
      method: "PATCH",
      headers: catalogHeaders(serviceKey, "return=minimal"),
      body: JSON.stringify({
        domain: zone.domain,
        service: zone.service,
        container: zone.container,
        image: zone.image,
        dockerfile: zone.dockerfile,
        upstream_env_key: zone.upstreamEnvKey,
        enabled: true,
        environment_id: environmentId,
        source: "unaxis",
        last_synced_at: syncedAt,
      }),
    },
  );
  if (!update.ok) {
    throw new Error(
      `Supabase zone sync failed (${update.status}): ${await update.text()}`,
    );
  }
}

export async function deleteZoneFromCatalog(key: string): Promise<void> {
  const { kongUrl, serviceKey } = catalogConfig();
  const assets = await fetchZoneCatalogAssets(key, kongUrl, serviceKey);

  await deleteCatalogDependents(key, kongUrl, serviceKey);
  await deleteZoneStorageAssets(assets, kongUrl, serviceKey);

  const response = await fetch(
    `${kongUrl}/rest/v1/zones?key=${keyFilter(key)}`,
    {
      method: "DELETE",
      headers: catalogHeaders(serviceKey, "return=minimal"),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase zone delete failed (${response.status}): ${await response.text()}`,
    );
  }
}

// ── Insert zone into SQLite zones table ───────────────────────────────────────

export async function insertZoneToDb(
  z: DerivedZone,
  onLine: OnLine,
): Promise<void> {
  // ── Resolve default-target environment id ─────────────────────────────────
  // Null is fine: zones.environment_id is nullable for backward compat.
  let activeEnvironmentId: string | null = null;
  try {
    const envs = dbGetEnvironments();
    const defaultEnv = envs.find((e) => e.isDefaultTarget) ?? envs[0] ?? null;
    activeEnvironmentId = defaultEnv?.id ?? null;
  } catch {
    // Non-fatal: zone registers without an environment link.
  }

  // ── Compute next sort_order ───────────────────────────────────────────────
  let sortOrder = 0;
  try {
    const allZones = dbGetAllZones();
    const maxSort = allZones.reduce(
      (max, row) => Math.max(max, row.sort_order),
      -1,
    );
    sortOrder = maxSort + 1;
  } catch {
    // Non-fatal: default to 0.
  }

  dbUpsertZone({
    key: z.key,
    label: z.label,
    domain: z.domain,
    service: z.service,
    container: z.container,
    image: z.image,
    dockerfile: z.dockerfile,
    upstreamEnvKey: z.upstreamEnvKey,
    sortOrder,
    enabled: true,
    environmentId: activeEnvironmentId,
  });

  invalidateZoneCache();
  onLine(`✓ Registered in control-db (SQLite)`);

  if (activeEnvironmentId) {
    onLine(`  ↳ linked to environment ${activeEnvironmentId.slice(0, 8)}…`);
  } else {
    onLine(`  ↳ no default environment set — environment_id left null`);
  }

  try {
    await synchronizeZoneCatalog(z, sortOrder, activeEnvironmentId);
    onLine(`✓ Synchronized dashboard catalog (Supabase)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLine(`⚠ Could not synchronize dashboard catalog: ${msg}`);
  }

  // TODO(active-active): Insert managed_stacks row once the SQLite schema
  // includes that table.  For now, environment_id on the zone row carries
  // the host placement info.  Tracked in:
  //   vault/Brain/synthesis-active-active-architecture.md
}

// ── Delete zone from SQLite zones table ───────────────────────────────────────

export async function deleteZoneFromDb(
  key: string,
  onLine: OnLine,
): Promise<void> {
  try {
    dbDeleteZone(key);
    invalidateZoneCache();
    onLine(`✓ Removed from control-db (SQLite)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLine(`⚠ Could not remove zone from DB: ${msg}`);
  }

  try {
    await deleteZoneFromCatalog(key);
    onLine(`✓ Removed from dashboard catalog (Supabase)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLine(`⚠ Could not remove dashboard catalog row: ${msg}`);
  }
}
