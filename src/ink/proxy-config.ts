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
import type { UnaxisEnvironment } from "./environment-store.ts";

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

// ── Upstream derivation ───────────────────────────────────────────────────────

/**
 * Derive the proxy upstream URL for a zone given its assigned environment.
 *
 * Strategy:
 *   local-docker  — zone runs on the same Docker bridge as unt_proxy; use
 *                   container-name DNS (no port exposure required, most reliable).
 *   remote-docker — zone runs on a different host; container-name DNS doesn't
 *                   resolve across the bridge boundary, so use the environment's
 *                   host IP extracted from agentUrl.
 *   null/unknown  — fall back to container-name DNS (safest default).
 */
export function deriveZoneUpstream(zone: Zone, env: UnaxisEnvironment | null): string {
  if (!env || env.type === "local-docker") {
    return `http://${zone.container}:3000`;
  }

  // Remote environment: extract host IP from agentUrl or proxyHost.
  let host = env.proxyHost || "";
  if (!host && env.agentUrl) {
    try { host = new URL(env.agentUrl).hostname; } catch { /* ignore */ }
  }

  return host ? `http://${host}:3000` : `http://${zone.container}:3000`;
}

// ── Startup reconciliation ────────────────────────────────────────────────────

/**
 * Rebuild routes.json from SQLite zone data + live Docker state on each environment.
 *
 * The control-plane SQLite DB is the source of truth for zone definitions.
 * This function:
 *   - Resolves each zone's upstream via its environment_id (env-aware IPs).
 *   - Adds a route for every production zone whose container is running on
 *     its assigned environment's agent.
 *   - Keeps dev routes only while their dev container is running on POWER.
 *   - Removes everything else (stale routes, crashed containers).
 *
 * No-op if the zone list is empty — never wipes a working routes.json.
 *
 * @param zones                   All enabled zones (with environmentId populated).
 * @param environments            All registered environments.
 * @param getLocalContainerStatus Callback for POWER-local container status.
 * @param onLine                  Progress lines for TUI display.
 */
export async function reconcileProxyRoutes(
  zones:                   Zone[],
  environments:            UnaxisEnvironment[],
  getLocalContainerStatus: (name: string) => Promise<string>,
  onLine?:                 (l: string) => void,
): Promise<void> {
  if (zones.length === 0) return;

  const current = read();
  const next: Record<string, string> = {};
  const envById = new Map<string, UnaxisEnvironment>(environments.map((e) => [e.id, e]));

  // Cache remote container lists — one agent call per environment.
  const remoteCache = new Map<string, Map<string, string>>();

  async function getRemoteContainerStatus(env: UnaxisEnvironment, name: string): Promise<string> {
    if (!remoteCache.has(env.id)) {
      const { fetchContainers } = await import("./agent-client.js");
      const list = await fetchContainers(env).catch(() => null);
      const byName = new Map<string, string>();
      for (const c of list ?? []) {
        for (const n of c.Names) {
          byName.set(n.replace(/^\//, ""), c.State);
        }
      }
      remoteCache.set(env.id, byName);
    }
    return remoteCache.get(env.id)!.get(name) ?? "missing";
  }

  // Production zone routes
  for (const zone of zones) {
    const env     = zone.environmentId ? (envById.get(zone.environmentId) ?? null) : null;
    const isLocal = !env || env.type === "local-docker";

    const status = isLocal
      ? await getLocalContainerStatus(zone.container)
      : await getRemoteContainerStatus(env!, zone.container);

    if (status === "running" || status === "starting") {
      next[zone.key] = deriveZoneUpstream(zone, env);
    }
  }

  // Dev routes — always local (dev containers run on POWER only).
  for (const [key] of Object.entries(current.zones)) {
    if (!key.startsWith("dev")) continue;
    const suffix    = key === "dev" ? "core" : key.slice(4);
    const container = `dev-${suffix}`;
    const status    = await getLocalContainerStatus(container);
    if (status === "running" || status === "starting") {
      next[key] = `http://${container}:3000`;
    }
  }

  write({ ...current, zones: next });
  await signalProxyReload();

  const kept    = Object.keys(next);
  const removed = Object.keys(current.zones).filter((k) => !(k in next));
  if (removed.length) onLine?.(`  removed stale routes: ${removed.join(", ")}`);
  onLine?.(`✓ proxy synced — ${kept.length} active route${kept.length !== 1 ? "s" : ""}: ${kept.join(", ") || "none"}`);
}
