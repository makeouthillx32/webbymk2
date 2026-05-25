// src/ink/proxy-config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read / write proxy-config/routes.json — the live routing table for the
// reverse proxy.
//
// Supabase is the source of truth for zone definitions. routes.json is a
// derived cache that the proxy reads. On every TUI boot, reconcileProxyRoutes()
// rebuilds it from live Supabase data + Docker container state so it is always
// correct regardless of what happened while the TUI was down.
//
// After every write, signalProxyReload() hits POST /reload on the proxy admin
// API for an instant in-memory route update — no container restart needed.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { PROJECT_DIR } from "../config/zones.ts";
import type { Zone } from "../config/zones.ts";

export const PROXY_ADMIN_URL = process.env.PROXY_ADMIN_URL ?? "http://127.0.0.1:3081";

// ── Admin signal ──────────────────────────────────────────────────────────────

async function signalProxyReload(): Promise<void> {
  try {
    await fetch(`${PROXY_ADMIN_URL}/reload`, { method: "POST", signal: AbortSignal.timeout(2_000) });
  } catch {
    // Proxy unreachable — poll fallback will catch it.
  }
}

const ROUTES_FILE = join(PROJECT_DIR, "proxy-config", "routes.json");

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A registered Supabase database instance for proxy + NPM routing.
 * Stored in routes.json under "databases" for TUI display and reconciliation.
 * Actual HTTP routing is done by NPM pointing directly at the host ports.
 */
export interface DatabaseRouteEntry {
  /** Kong API gateway upstream — http://{stackIp}:{kongPort} */
  apiUpstream:    string;
  /** Studio upstream — http://{stackIp}:{studioPort} */
  studioUpstream: string;
  /** Public domain for the API gateway — db.{slug}.{coreDomain} */
  apiDomain:      string;
  /** Public domain for Studio — studio.{slug}.{coreDomain} */
  studioDomain:   string;
  /** NPM proxy host ID for apiDomain, null until registered */
  npmApiHostId?:    number | null;
  /** NPM proxy host ID for studioDomain, null until registered */
  npmStudioHostId?: number | null;
  registeredAt:   string;   // ISO-8601
}

export interface ProxyRoutes {
  coreDomain:   string;
  coreUpstream: string;
  zones:        Record<string, string>;
  /** Registered Supabase database instances, keyed by slug. */
  databases?:   Record<string, DatabaseRouteEntry>;
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

function read(): ProxyRoutes {
  if (!existsSync(ROUTES_FILE)) {
    return { coreDomain: "unenter.live", coreUpstream: "http://unt_app:3000", zones: {} };
  }
  try {
    return JSON.parse(readFileSync(ROUTES_FILE, "utf-8")) as ProxyRoutes;
  } catch {
    return { coreDomain: "unenter.live", coreUpstream: "http://unt_app:3000", zones: {} };
  }
}

function write(routes: ProxyRoutes): void {
  mkdirSync(dirname(ROUTES_FILE), { recursive: true });
  writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2) + "\n", "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function addZoneRoute(
  key:      string,
  upstream: string,
  onLine?:  (l: string) => void,
): Promise<void> {
  const routes = read();
  routes.zones[key] = upstream;
  write(routes);
  await signalProxyReload();
  onLine?.(`✓ proxy route added:  ${key}.${routes.coreDomain}  →  ${upstream}`);
}

export async function removeZoneRoute(
  key:     string,
  onLine?: (l: string) => void,
): Promise<void> {
  const routes = read();
  if (!routes.zones[key]) {
    onLine?.(`  No proxy route for "${key}" — nothing to remove`);
    return;
  }
  delete routes.zones[key];
  write(routes);
  await signalProxyReload();
  onLine?.(`✓ proxy route removed:  ${key}.${routes.coreDomain}`);
}

export function getRoutes(): ProxyRoutes {
  return read();
}

// ── Database instance routing ─────────────────────────────────────────────────
//
// Each Supabase database instance gets two public subdomains:
//   db.{slug}.{coreDomain}      → Kong API gateway (port kong)
//   studio.{slug}.{coreDomain}  → Supabase Studio   (port studio)
//
// Routing is handled by NPM pointing directly at the stack host ports —
// traffic never flows through the internal zone proxy for database instances.
// These entries in routes.json are metadata for TUI display and reconciliation.

/**
 * Register a database instance in routes.json.
 * Stores upstream URLs and public domains for TUI display.
 * Does NOT register in NPM — call npmAddDatabaseHosts() separately.
 */
export async function addDatabaseRoutes(
  slug:     string,
  ports:    { kong: number; studio: number },
  stackIp:  string,
  onLine?:  (l: string) => void,
): Promise<DatabaseRouteEntry> {
  const routes     = read();
  const coreDomain = routes.coreDomain || "unenter.live";

  const entry: DatabaseRouteEntry = {
    apiUpstream:    `http://${stackIp}:${ports.kong}`,
    studioUpstream: `http://${stackIp}:${ports.studio}`,
    apiDomain:      `db.${slug}.${coreDomain}`,
    studioDomain:   `studio.${slug}.${coreDomain}`,
    registeredAt:   new Date().toISOString(),
  };

  routes.databases        = routes.databases ?? {};
  routes.databases[slug]  = entry;
  write(routes);
  await signalProxyReload();

  onLine?.(`✓ database routes registered:`);
  onLine?.(`  ${entry.apiDomain}  →  ${entry.apiUpstream}`);
  onLine?.(`  ${entry.studioDomain}  →  ${entry.studioUpstream}`);

  return entry;
}

/**
 * Update the NPM host IDs for a registered database instance after NPM
 * registration completes.
 */
export async function setDatabaseNpmIds(
  slug:         string,
  npmApiId:     number | null,
  npmStudioId:  number | null,
): Promise<void> {
  const routes = read();
  if (!routes.databases?.[slug]) return;
  routes.databases[slug].npmApiHostId    = npmApiId;
  routes.databases[slug].npmStudioHostId = npmStudioId;
  write(routes);
  // No proxy reload needed — NPM IDs are metadata only.
}

/**
 * Remove a database instance from routes.json.
 */
export async function removeDatabaseRoutes(
  slug:    string,
  onLine?: (l: string) => void,
): Promise<void> {
  const routes = read();
  if (!routes.databases?.[slug]) {
    onLine?.(`  No database route for "${slug}" — nothing to remove`);
    return;
  }
  const entry = routes.databases[slug];
  delete routes.databases[slug];
  write(routes);
  await signalProxyReload();
  onLine?.(`✓ database routes removed: ${entry.apiDomain}, ${entry.studioDomain}`);
}

/** Return all registered database instances. */
export function getDatabaseRoutes(): Record<string, DatabaseRouteEntry> {
  return read().databases ?? {};
}

// ── Startup reconciliation ────────────────────────────────────────────────────

/**
 * Rebuild routes.json from Supabase zone data + live Docker state.
 *
 * Supabase is the source of truth for zone definitions. This function:
 *   - Adds a route for every production zone whose container is running.
 *   - Keeps dev routes only while their dev container is still running.
 *   - Removes everything else (stale routes, manual edits, crashed containers).
 *
 * Called on TUI boot. No-op if Supabase returned an empty zone list so we
 * never wipe a working routes.json when the DB is temporarily unreachable.
 */
export async function reconcileProxyRoutes(
  zones:              Zone[],
  getContainerStatus: (name: string) => Promise<string>,
  onLine?:            (l: string) => void,
): Promise<void> {
  if (zones.length === 0) return;

  const current = read();
  const next: Record<string, string> = {};

  // Production zone routes — derived from Supabase zone definitions
  for (const zone of zones) {
    const upstream = `http://${zone.container}:3000`;
    const status = await getContainerStatus(zone.container);
    if (status === "running" || status === "starting") {
      next[zone.key] = upstream;
    }
    // Container not running → omit route; no stale entry, no 502
  }

  // Dev routes — keep only while the dev container is actually running
  // "dev"       → dev-core   (core zone in dev mode)
  // "dev.blog"  → dev-blog   (blog zone in dev mode)
  for (const [key, upstream] of Object.entries(current.zones)) {
    if (!key.startsWith("dev")) continue;
    const suffix    = key === "dev" ? "core" : key.slice(4); // strip "dev."
    const container = `dev-${suffix}`;
    const status    = await getContainerStatus(container);
    if (status === "running" || status === "starting") {
      next[key] = upstream;
    }
    // Gone container → key not added → route disappears automatically
  }

  const updated: ProxyRoutes = {
    coreDomain:   current.coreDomain,
    coreUpstream: current.coreUpstream,
    zones:        next,
  };

  write(updated);
  await signalProxyReload();

  const kept    = Object.keys(next);
  const removed = Object.keys(current.zones).filter((k) => !(k in next));
  if (removed.length) onLine?.(`  removed stale routes: ${removed.join(", ")}`);
  onLine?.(`✓ proxy synced from Supabase — ${kept.length} active route${kept.length !== 1 ? "s" : ""}: ${kept.join(", ") || "none"}`);
}
