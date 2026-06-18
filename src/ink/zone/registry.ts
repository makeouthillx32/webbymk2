// src/ink/zone/registry.ts
// ─────────────────────────────────────────────────────────────────────────────
// SQLite zone table operations.
//
// Zone topology is stored in the local SQLite control-plane DB (control.db).
// These helpers INSERT / DELETE rows and bust the in-memory cache so the TUI
// reflects changes immediately without a restart.
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

// ── Insert zone into SQLite zones table ───────────────────────────────────────

export async function insertZoneToDb(z: DerivedZone, onLine: OnLine): Promise<void> {
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
    const maxSort  = allZones.reduce((max, row) => Math.max(max, row.sort_order), -1);
    sortOrder = maxSort + 1;
  } catch {
    // Non-fatal: default to 0.
  }

  dbUpsertZone({
    key:            z.key,
    label:          z.label,
    domain:         z.domain,
    service:        z.service,
    container:      z.container,
    image:          z.image,
    dockerfile:     z.dockerfile,
    upstreamEnvKey: z.upstreamEnvKey,
    sortOrder,
    enabled:        true,
    environmentId:  activeEnvironmentId,
  });

  invalidateZoneCache();
  onLine(`✓ Registered in control-db (SQLite)`);

  if (activeEnvironmentId) {
    onLine(`  ↳ linked to environment ${activeEnvironmentId.slice(0, 8)}…`);
  } else {
    onLine(`  ↳ no default environment set — environment_id left null`);
  }

  // TODO(active-active): Insert managed_stacks row once the SQLite schema
  // includes that table.  For now, environment_id on the zone row carries
  // the host placement info.  Tracked in:
  //   vault/Brain/synthesis-active-active-architecture.md
}

// ── Delete zone from SQLite zones table ───────────────────────────────────────

export async function deleteZoneFromDb(key: string, onLine: OnLine): Promise<void> {
  try {
    dbDeleteZone(key);
    invalidateZoneCache();
    onLine(`✓ Removed from control-db (SQLite)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLine(`⚠ Could not remove zone from DB: ${msg}`);
  }
}
