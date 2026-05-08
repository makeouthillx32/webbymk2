// src/ink/proxy-config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read / write proxy-config/routes.json — the live routing table for the
// reverse proxy.
//
// After every write, the TUI calls signalProxyReload() which hits the proxy's
// internal admin API (POST http://127.0.0.1:3081/reload).  The proxy reloads
// its in-memory route map instantly — no container restart, no file watching,
// no OS-specific inotify dependency.
//
// fs.watch + polling remain in the proxy as a defence-in-depth fallback (e.g.
// manual edits to routes.json), but the admin API is the primary signal path.
//
// Shape:
//   {
//     "coreDomain":   "unenter.live",
//     "coreUpstream": "http://unt_app:3000",
//     "zones": {
//       "blog":   "http://blog:3000",
//       "shop":   "http://shop:3000",
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { PROJECT_DIR } from "../config/zones.ts";

const PROXY_ADMIN_URL = process.env.PROXY_ADMIN_URL ?? "http://127.0.0.1:3081";

// ── Admin signal ──────────────────────────────────────────────────────────────

/**
 * Tell the running proxy container to reload its route map from routes.json.
 * Fire-and-forget — if the proxy is unreachable the file-watch/poll fallback
 * still picks up the change; this just makes it instantaneous.
 */
async function signalProxyReload(): Promise<void> {
  try {
    await fetch(`${PROXY_ADMIN_URL}/reload`, { method: "POST", signal: AbortSignal.timeout(2_000) });
  } catch {
    // Proxy unreachable or not yet started — poll fallback will catch it.
  }
}

const ROUTES_FILE = join(PROJECT_DIR, "proxy-config", "routes.json");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProxyRoutes {
  coreDomain:   string;
  coreUpstream: string;
  zones:        Record<string, string>;
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

function read(): ProxyRoutes {
  if (!existsSync(ROUTES_FILE)) {
    return {
      coreDomain:   "unenter.live",
      coreUpstream: "http://unt_app:3000",
      zones:        {},
    };
  }
  try {
    return JSON.parse(readFileSync(ROUTES_FILE, "utf-8")) as ProxyRoutes;
  } catch {
    // Corrupt file — return safe default rather than crashing.
    return {
      coreDomain:   "unenter.live",
      coreUpstream: "http://unt_app:3000",
      zones:        {},
    };
  }
}

function write(routes: ProxyRoutes): void {
  mkdirSync(dirname(ROUTES_FILE), { recursive: true });
  writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2) + "\n", "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a zone in the live routing table.
 * The proxy hot-reloads within ~150ms — no restart needed.
 *
 * @param key      Zone key (e.g. "test21")
 * @param upstream Internal Docker upstream (e.g. "http://test21:3000")
 * @param onLine   Optional progress logger
 */
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

/**
 * Remove a zone from the live routing table.
 * The proxy stops forwarding to this zone within ~150ms.
 *
 * @param key    Zone key (e.g. "test21")
 * @param onLine Optional progress logger
 */
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

/**
 * Return the current routes map for display/debugging.
 */
export function getRoutes(): ProxyRoutes {
  return read();
}
