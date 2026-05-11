// src/ink/zone-store.ts
// Load zone definitions from the Supabase `zones` table via PostgREST.
//
// Fallback: If the Supabase stack is unreachable at startup the TUI stays
// functional -- it just shows an empty zone list. All other panels continue.

import {
  ensureRuntimeEnv,
  getRuntimeKongUrl,
  getRuntimeServiceKey,
} from "../utils/runtimeEnv.js";
import type { Zone } from "../config/zones.ts";

// DB row shape (PostgREST snake_case)

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

// In-memory cache

let _cache: Zone[] | null = null;
let _fetchedAt = 0;
const CACHE_TTL_MS = 60_000;  // re-fetch after 1 minute

// Last error, exposed so callers can surface it in the TUI
export let lastZoneError: string | null = null;

// Row -> Zone

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

// Debug logger -- writes to stderr when UNAXIS_DEBUG=1
function dbg(msg: string) {
  if (process.env.UNAXIS_DEBUG) {
    process.stderr.write("[zone-store] " + msg + "\n");
  }
}

/**
 * Fetch all enabled zones from Supabase, sorted by sort_order.
 * Results cached for CACHE_TTL_MS. Pass force=true to bypass cache.
 */
export async function loadZones(force = false): Promise<Zone[]> {
  const now = Date.now();
  if (!force && _cache !== null && now - _fetchedAt < CACHE_TTL_MS) {
    dbg("returning cached zones (" + _cache.length + ")");
    return _cache;
  }

  // Check for fetch availability (requires Node >= 18)
  if (typeof fetch === "undefined") {
    const msg = "global fetch is not available (requires Node.js >= 18). Current: " + process.version;
    dbg("ERROR: " + msg);
    lastZoneError = msg;
    if (_cache !== null) return _cache;
    return [];
  }

  // Read auth credentials at call-time so they reflect the env state AFTER
  // .env loading completes -- not the module-init snapshot which may be stale.
  const envState = ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const serviceKey = getRuntimeServiceKey();

  const url = kongUrl + "/rest/v1/zones?enabled=eq.true&order=sort_order.asc";
  dbg("kongUrl: " + kongUrl);
  dbg("serviceKey length: " + serviceKey.length);
  dbg("serviceKey set: " + (serviceKey.length > 0 ? "yes" : "NO - empty!"));
  dbg("fetching: " + url);

  if (!serviceKey) {
    const msg = "SERVICE_ROLE_KEY not loaded from .env at zones fetch time"
      + (envState.projectRoot ? ` (root: ${envState.projectRoot})` : " (project root not found)");
    dbg("ERROR: " + msg);
    lastZoneError = msg;
    if (_cache !== null) return _cache;
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": "Bearer " + serviceKey,
        "apikey":        serviceKey,
        "Accept":        "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    dbg("response status: " + res.status + " " + res.statusText);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error("PostgREST " + res.status + ": " + body.slice(0, 200));
    }

    const rows = await res.json() as ZoneRow[];
    dbg("rows received: " + rows.length);
    lastZoneError = null;
    _cache     = rows.map(rowToZone);
    _fetchedAt = Date.now();
    return _cache;

  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    dbg("fetch error: " + msg);
    lastZoneError = msg;
    // Return cached data on network blip
    if (_cache !== null) return _cache;
    // No cache and no connection -- return empty
    return [];
  }
}

/** Bust the cache (e.g. after zone-scaffold creates/deletes a zone). */
export function invalidateZoneCache(): void {
  _cache     = null;
  _fetchedAt = 0;
}
