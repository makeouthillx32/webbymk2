// src/ink/zone-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone definitions from the local SQLite control-plane DB.
//
// Replaces the previous PostgREST fetch against unenter.db (Supabase).
// The TUI no longer depends on unenter.live being reachable to load zones.
//
// Run `unaxis db migrate-control` once to import existing zones from Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import type { Zone } from "../config/zones.ts";
import { dbGetZones, dbUpsertZone, dbDeleteZone, dbDisableZone, dbEnableZone, dbSetZoneHosting } from "./control-db.ts";

// In-memory cache (still useful to avoid repeated SQLite reads on tight loops)

let _cache: Zone[] | null = null;
let _fetchedAt = 0;
const CACHE_TTL_MS = 5_000;  // short TTL — SQLite is local so re-reads are cheap

export let lastZoneError: string | null = null;

function dbg(msg: string) {
  if (process.env["UNAXIS_DEBUG"]) {
    process.stderr.write("[zone-store] " + msg + "\n");
  }
}

/**
 * Load all enabled zones from the local SQLite control-db, sorted by sort_order.
 * Results cached for CACHE_TTL_MS. Pass force=true to bypass cache.
 *
 * Never fails: returns [] if the DB is empty or first-boot (no migration yet).
 */
export async function loadZones(force = false): Promise<Zone[]> {
  const now = Date.now();
  if (!force && _cache !== null && now - _fetchedAt < CACHE_TTL_MS) {
    dbg("returning cached zones (" + _cache.length + ")");
    return _cache;
  }

  try {
    const zones = dbGetZones();
    dbg("loaded " + zones.length + " zones from SQLite");
    lastZoneError = null;
    _cache     = zones;
    _fetchedAt = Date.now();
    return zones;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbg("SQLite error: " + msg);
    lastZoneError = msg;
    return _cache ?? [];
  }
}

/** Bust the cache (e.g. after zone-scaffold creates/deletes a zone). */
export function invalidateZoneCache(): void {
  _cache     = null;
  _fetchedAt = 0;
}

/**
 * Persist a new or updated zone to SQLite.
 * Also busts the cache so the next loadZones() reflects the change.
 */
export function saveZone(zone: {
  id?:            string;
  key:            string;
  label:          string;
  domain:         string;
  service:        string;
  container:      string;
  image:          string;
  dockerfile?:    string | null;
  upstreamEnvKey: string;
  sortOrder?:     number;
  enabled?:       boolean;
  environmentId?: string | null;
}): void {
  dbUpsertZone(zone);
  invalidateZoneCache();
}

/** Remove a zone from SQLite and bust the cache. */
export function removeZone(key: string, soft = true): void {
  if (soft) {
    dbDisableZone(key);
  } else {
    dbDeleteZone(key);
  }
  invalidateZoneCache();
}

/** Re-enable a previously soft-disabled zone and bust the cache. */
export function restoreZone(key: string): void {
  dbEnableZone(key);
  invalidateZoneCache();
}

/** Set a zone's hosting mode ('docker' | 'vercel') and bust the cache. */
export function setZoneHosting(key: string, hosting: "docker" | "vercel"): void {
  dbSetZoneHosting(key, hosting);
  invalidateZoneCache();
}
