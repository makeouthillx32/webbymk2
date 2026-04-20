// src/ink/zone-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Loads zone definitions from the Supabase `zones` table via PostgREST.
//
// Why this exists instead of config/zones.ts:
//   Hardcoded zone topology in a git repo exposes infrastructure detail that
//   can be used to fingerprint or compromise the deployment.  Storing zones
//   in the DB means no zone topology leaks through source control, and new
//   zones can be added without a code deploy.
//
// Usage:
//   const zones = await loadZones();   // first call hits PostgREST
//   const zones = await loadZones();   // subsequent calls return cached copy
//
// Fallback:
//   If the Supabase stack is unreachable at startup the TUI stays functional
//   — it just shows an empty zone list and emits a warning line.  All other
//   panels (NPM, DB, Infra) continue working normally.
// ─────────────────────────────────────────────────────────────────────────────

import { KONG_URL, SERVICE_KEY } from "./db-api.ts";
import type { Zone } from "../config/zones.ts";

// ── DB row shape (PostgREST snake_case) ───────────────────────────────────────

interface ZoneRow {
  id:               string;
  key:              string;
  label:            string;
  domain:           string;
  service:          string;
  container:        string;
  image:            string;
  dockerfile:       string | null;
  upstream_env_key: string;
  sort_order:       number;
  enabled:          boolean;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _cache: Zone[] | null = null;
let _fetchedAt = 0;
const CACHE_TTL_MS = 60_000;   // re-fetch after 1 minute

// ── Row → Zone ────────────────────────────────────────────────────────────────

function rowToZone(r: ZoneRow): Zone {
  return {
    key:            r.key,
    label:          r.label,
    domain:         r.domain,
    service:        r.service,
    container:      r.container,
    image:          r.image,
    dockerfile:     r.dockerfile ?? undefined,
    upstreamEnvKey: r.upstream_env_key,
  };
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

/**
 * Fetch all enabled zones from Supabase, sorted by sort_order.
 *
 * Results are cached for CACHE_TTL_MS — subsequent calls within the window
 * are synchronous-fast.  Pass `force=true` to bypass the cache.
 */
export async function loadZones(force = false): Promise<Zone[]> {
  const now = Date.now();
  if (!force && _cache !== null && now - _fetchedAt < CACHE_TTL_MS) {
    return _cache;
  }

  const url = `${KONG_URL}/rest/v1/zones?enabled=eq.true&order=sort_order.asc`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey":        SERVICE_KEY,
        "Accept":        "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostgREST ${res.status}: ${body}`);
    }

    const rows = await res.json() as ZoneRow[];
    _cache     = rows.map(rowToZone);
    _fetchedAt = Date.now();
    return _cache;

  } catch (err) {
    clearTimeout(timer);
    // Return cached data if we have it — network blip shouldn't kill the TUI
    if (_cache !== null) return _cache;
    // No cache and no connection — return empty; App.tsx will show warning
    return [];
  }
}

/** Bust the cache (e.g. after a zone is created or deleted via zone-scaffold). */
export function invalidateZoneCache(): void {
  _cache     = null;
  _fetchedAt = 0;
}
