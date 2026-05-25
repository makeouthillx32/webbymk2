// proxy/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Unenter multi-zone reverse proxy.
//
// Routes incoming HTTP requests to the correct Next.js zone by matching the
// Host header (subdomain) or falling back to path-prefix matching.
//
// DYNAMIC ROUTING — no proxy restart ever needed
// ─────────────────────────────────────────────────────────────────────────────
//  Routes are loaded from /proxy-config/routes.json (bind-mounted volume).
//  The TUI writes that file directly when zones are added or removed.
//  This server watches the file with fs.watch and hot-reloads the route map
//  in memory — new zones are live in ~100ms with zero downtime.
//
//  routes.json shape:
//  {
//    "coreDomain":    "unenter.live",
//    "coreUpstream":  "http://unt_app:3000",
//    "zones": {
//      "blog":  "http://blog:3000",
//      "shop":  "http://shop:3000"
//    }
//  }
//
//  UPSTREAM_* env vars are still read as a fallback in case the config file
//  is missing or malformed (backwards compat / cold-start safety).
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const fs        = require("fs");
const path      = require("path");
const http      = require("http");
const httpProxy = require("http-proxy");

// ── Configuration ─────────────────────────────────────────────────────────────

const PROXY_PORT       = parseInt(process.env.PROXY_PORT ?? "80", 10);
const PROXY_HOST       = process.env.PROXY_HOST          ?? "0.0.0.0";
const ROUTES_FILE      = process.env.ROUTES_FILE         ?? "/proxy-config/routes.json";
const DEFAULT_UPSTREAM = process.env.UPSTREAM_UNENTER    ?? "http://unt_app:3000";

// ── Route map (hot-reloadable) ────────────────────────────────────────────────

/**
 * In-memory route map.  Keys are canonical hostnames (no port).
 * Values are the internal upstream target URL.
 * Rebuilt whenever routes.json changes — reads take a lock-free snapshot.
 */
let zoneUpstreams = {};
let coreDomain    = process.env.CORE_DOMAIN ?? "unenter.live";
let coreUpstream  = DEFAULT_UPSTREAM;

function loadRoutes() {
  try {
    const raw    = fs.readFileSync(ROUTES_FILE, "utf-8");
    const config = JSON.parse(raw);

    const newCoreDomain   = config.coreDomain   ?? coreDomain;
    const newCoreUpstream = config.coreUpstream  ?? coreUpstream;
    const zones           = config.zones         ?? {};

    const map = {};
    map[newCoreDomain]           = newCoreUpstream;
    map[`www.${newCoreDomain}`]  = newCoreUpstream;

    for (const [key, upstream] of Object.entries(zones)) {
      if (!upstream) continue;
      // "dashboard" and "app" may share the core upstream — that's fine.
      map[`${key}.${newCoreDomain}`] = upstream;
    }

    // Atomic swap — resolveTarget() always sees a consistent snapshot.
    zoneUpstreams = map;
    coreDomain    = newCoreDomain;
    coreUpstream  = newCoreUpstream;

    console.log(`[proxy] routes loaded from ${ROUTES_FILE} (${Object.keys(map).length} hosts)`);
    for (const [host, target] of Object.entries(map)) {
      console.log(`  ${host.padEnd(40)} → ${target}`);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      // File not yet written — fall back to env vars silently.
      console.log(`[proxy] ${ROUTES_FILE} not found — falling back to UPSTREAM_* env vars`);
      loadRoutesFromEnv();
    } else {
      console.error(`[proxy] failed to parse ${ROUTES_FILE}:`, err.message);
      // Keep existing map — don't wipe routes on a bad write.
    }
  }
}

/** Env-var fallback (backwards compat).  Reads UPSTREAM_<KEY> vars. */
function loadRoutesFromEnv() {
  const map = {};
  map[coreDomain]           = DEFAULT_UPSTREAM;
  map[`www.${coreDomain}`]  = DEFAULT_UPSTREAM;

  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (!envKey.startsWith("UPSTREAM_") || !envVal) continue;
    const zoneKey = envKey.slice("UPSTREAM_".length).toLowerCase();
    if (zoneKey === "unenter") continue;
    map[`${zoneKey}.${coreDomain}`] = envVal;
  }

  zoneUpstreams = map;
  console.log(`[proxy] env-var route map built (${Object.keys(map).length} hosts)`);
}

// Initial load
loadRoutes();

// ── File watcher — hot-reload on change ───────────────────────────────────────
//
// Two-layer detection so route changes are picked up on every host OS:
//
//   1. fs.watch  — fires instantly on native Linux (production VMs, CI).
//                  Silently ignored when the OS doesn't support inotify.
//
//   2. Poll      — re-reads routes.json every 3 s by comparing mtime.
//                  Catches writes that fs.watch misses on Windows hosts
//                  running Docker Desktop (inotify events don't cross the
//                  NTFS → WSL2/Linux container boundary).
//
// Both layers call loadRoutes(); loadRoutes() is idempotent — calling it
// twice on the same file content is a no-op beyond a log line.

let watchDebounce = null;
let lastRouteMtime = 0;

function watchRoutes() {
  const dir = path.dirname(ROUTES_FILE);

  // Layer 1 — fs.watch (instant on Linux, no-op on Windows/Docker)
  try {
    fs.watch(dir, (event, filename) => {
      if (filename !== path.basename(ROUTES_FILE)) return;
      // Debounce: editors and atomic writers fire multiple events in quick
      // succession — wait 150ms for the dust to settle before re-reading.
      clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        console.log(`[proxy] routes.json changed (${event}) — reloading`);
        loadRoutes();
      }, 150);
    });
    console.log(`[proxy] watching ${dir} for route changes`);
  } catch (err) {
    // /proxy-config may not exist in local dev without the bind mount.
    console.warn(`[proxy] could not watch ${dir}: ${err.message} — falling back to poll only`);
  }

  // Layer 2 — poll every 3 s (fallback for Windows/Docker Desktop)
  setInterval(() => {
    try {
      const mtime = fs.statSync(ROUTES_FILE).mtimeMs;
      if (mtime !== lastRouteMtime) {
        lastRouteMtime = mtime;
        console.log(`[proxy] routes.json changed (poll) — reloading`);
        loadRoutes();
      }
    } catch {
      // file not yet present — ignore, try again next tick
    }
  }, 3_000);
}

watchRoutes();

// ── Path-prefix fallback (local dev / no subdomain routing) ───────────────────

const PATH_UPSTREAMS = [
  { prefix: "/dashboard",    getTarget: () => zoneUpstreams[`dashboard.${coreDomain}`] ?? coreUpstream },
  { prefix: "/shop",         getTarget: () => zoneUpstreams[`shop.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/products",     getTarget: () => zoneUpstreams[`shop.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/checkout",     getTarget: () => zoneUpstreams[`shop.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/collections",  getTarget: () => zoneUpstreams[`shop.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/sign-in",      getTarget: () => zoneUpstreams[`auth.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/sign-up",      getTarget: () => zoneUpstreams[`auth.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/forgot-password", getTarget: () => zoneUpstreams[`auth.${coreDomain}`]   ?? coreUpstream },
  { prefix: "/auth",         getTarget: () => zoneUpstreams[`auth.${coreDomain}`]      ?? coreUpstream },
  { prefix: "/profile",      getTarget: () => zoneUpstreams[`app.${coreDomain}`]       ?? coreUpstream },
  { prefix: "/settings",     getTarget: () => zoneUpstreams[`app.${coreDomain}`]       ?? coreUpstream },
  { prefix: "/",             getTarget: () => coreUpstream },
];

// ── Proxy instance ────────────────────────────────────────────────────────────

const proxy = httpProxy.createProxyServer({
  changeOrigin: false,  // preserve original Host header so Next.js middleware
                        // can detect the zone from the subdomain
  xfwd:         true,   // forward X-Forwarded-* headers
  proxyTimeout: 30_000,
  timeout:      30_000,
});

proxy.on("error", (err, req, res) => {
  console.error(`[proxy] error ${req.method} ${req.url} →`, err.message);
  // res is http.ServerResponse for HTTP but a net.Socket for WebSocket/HMR
  // upgrades — guard before calling HTTP-only methods.
  if (res && typeof res.writeHead === "function" && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad Gateway");
  } else if (res && typeof res.destroy === "function") {
    res.destroy();
  }
});

// ── Target resolution ─────────────────────────────────────────────────────────

function resolveTarget(req) {
  // NPM (Nginx Proxy Manager) sits in front of this proxy and rewrites the
  // Host header to the upstream address (e.g. "192.168.50.204").  The original
  // public hostname is preserved in X-Forwarded-Host.  Try that first so
  // zone routing works through NPM; fall back to Host for direct connections.
  const rawHost  = (req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "")
                     .split(",")[0].trim();
  const host     = rawHost.split(":")[0].toLowerCase();
  const pathname = (req.url ?? "/").split("?")[0];

  // 1. Host-based routing (production) — reads live snapshot
  if (zoneUpstreams[host]) return zoneUpstreams[host];

  // 2. Path-based routing (local dev / fallback)
  for (const { prefix, getTarget } of PATH_UPSTREAMS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return getTarget();
    }
  }

  return coreUpstream;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const target = resolveTarget(req);
  // Preserve the original x-forwarded-host set by NPM (the public hostname).
  // Only set it ourselves when it isn't already present — i.e. direct connections
  // that bypass NPM.  Overwriting it was the root cause of zone misdetection:
  // Next.js middleware saw the internal host instead of e.g. dev.blog.unenter.live.
  if (!req.headers["x-forwarded-host"]) {
    req.headers["x-forwarded-host"] = req.headers["host"] ?? "";
  }
  req.headers["x-proxy-version"]  = "1";
  proxy.web(req, res, { target }, (err) => {
    if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway"); }
  });
});

// WebSocket (Next.js HMR + Supabase Realtime)
server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: resolveTarget(req) }, (err) => {
    if (err) {
      console.error(`[proxy] ws error ${req.url} →`, err.message);
      socket.destroy();
    }
  });
});

server.listen(PROXY_PORT, PROXY_HOST, () => {
  console.log(`[proxy] listening on ${PROXY_HOST}:${PROXY_PORT}`);
});

// ── Admin API ─────────────────────────────────────────────────────────────────
//
// Lightweight internal HTTP server for the TUI to trigger instant route reloads.
// Bound to all interfaces so Docker's port mapping can reach it from the host.
// Only port 127.0.0.1:3081 is exposed in docker-compose — not reachable from
// the internet.
//
//   POST /reload   — re-read routes.json into memory immediately
//   GET  /health   — returns 200 { ok: true, routes: N } for TUI health checks

const ADMIN_PORT = parseInt(process.env.ADMIN_PORT ?? "3081", 10);

const adminServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "POST" && req.url === "/reload") {
    loadRoutes();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, routes: Object.keys(zoneUpstreams).length }));
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, routes: Object.keys(zoneUpstreams).length }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

adminServer.listen(ADMIN_PORT, "0.0.0.0", () => {
  console.log(`[proxy] admin API listening on 0.0.0.0:${ADMIN_PORT}`);
});

// ── Agent API ─────────────────────────────────────────────────────────────────
// Loaded as a child module — see proxy/agent.js for the full implementation.
// agent.js starts its own HTTP server on AGENT_PORT (default 8888) and handles
// its own SIGTERM/SIGINT.  No changes needed here when the agent is updated.
require("./agent");

// Graceful shutdown (proxy + admin servers only — agent.js handles its own)
process.on("SIGTERM", () => {
  console.log("[proxy] SIGTERM — shutting down");
  server.close();
  adminServer.close();
});
process.on("SIGINT", () => {
  server.close();
  adminServer.close();
});
