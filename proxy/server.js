// proxy/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Unenter multi-zone reverse proxy.
//
// Routes incoming HTTP requests to the correct Next.js zone by matching the
// Host header (subdomain) or falling back to path-prefix matching.
//
// ZONE → UPSTREAM MAP
// ─────────────────────────────────────────────────────────────────────────────
//  unenter.live               →  app:3000  (monolith / core)
//  dashboard.unenter.live     →  app:3001  (split when ready)
//  shop.unenter.live          →  app:3002  (split when ready)
//  app.unenter.live           →  app:3003  (split when ready)
//
// While all zones run as a single Next.js monolith, all upstreams point to the
// same container (app:3000).  When a zone is split into its own container,
// update its upstream host/port here — nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const http      = require("http");
const httpProxy = require("http-proxy");

// ── Configuration ─────────────────────────────────────────────────────────────

const PROXY_PORT   = parseInt(process.env.PROXY_PORT   ?? "80",   10);
const PROXY_HOST   = process.env.PROXY_HOST             ?? "0.0.0.0";
const CORE_DOMAIN  = process.env.CORE_DOMAIN            ?? "unenter.live";

/**
 * Zone upstream map.
 * Keys are canonical hostnames (no port).
 * Values are the internal upstream target (container:port URL).
 *
 * Built dynamically from env vars so adding a new zone doesn't require
 * editing this file.  Rule:
 *
 *   UPSTREAM_UNENTER → CORE_DOMAIN  (and www.CORE_DOMAIN)  — special case (core)
 *   UPSTREAM_<KEY>   → <key>.CORE_DOMAIN                    — all other zones
 *
 * The TUI's zone-adder writes UPSTREAM_<KEY> to docker-compose.yml, and on
 * proxy restart this map picks it up automatically.  If a zone has no
 * UPSTREAM_* in the environment it silently does not route — fail-soft so
 * an in-progress scaffold doesn't break the proxy for other zones.
 *
 * MONOLITH MODE: unset upstreams default to app:3000 (the shared core).
 * SPLIT   MODE: set UPSTREAM_<KEY> per-zone to its own container.
 */
const DEFAULT_UPSTREAM = "http://app:3000";

function buildZoneUpstreams() {
  const map = {};

  // Always route the bare core domain — even if UPSTREAM_UNENTER is unset,
  // we want to serve SOMETHING for unenter.live rather than 502.
  const coreTarget = process.env.UPSTREAM_UNENTER ?? DEFAULT_UPSTREAM;
  map[CORE_DOMAIN]           = coreTarget;
  map[`www.${CORE_DOMAIN}`]  = coreTarget;

  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (!envKey.startsWith("UPSTREAM_")) continue;
    if (!envVal)                          continue;                // empty var → skip

    const zoneKey = envKey.slice("UPSTREAM_".length).toLowerCase();
    if (zoneKey === "unenter") continue;                            // already handled above

    map[`${zoneKey}.${CORE_DOMAIN}`] = envVal;
  }

  return map;
}

const ZONE_UPSTREAMS = buildZoneUpstreams();

/**
 * Path-prefix fallback (used in local dev where no subdomain routing exists).
 * First match wins — order from most-specific to least.
 */
const PATH_UPSTREAMS = [
  { prefix: "/dashboard",    target: process.env.UPSTREAM_DASHBOARD ?? "http://app:3000" },
  { prefix: "/shop",         target: process.env.UPSTREAM_SHOP      ?? "http://app:3000" },
  { prefix: "/products",     target: process.env.UPSTREAM_SHOP      ?? "http://app:3000" },
  { prefix: "/checkout",     target: process.env.UPSTREAM_SHOP      ?? "http://app:3000" },
  { prefix: "/collections",  target: process.env.UPSTREAM_SHOP      ?? "http://app:3000" },
  { prefix: "/sign-in",         target: process.env.UPSTREAM_AUTH ?? "http://authzone:3000" },
  { prefix: "/sign-up",         target: process.env.UPSTREAM_AUTH ?? "http://authzone:3000" },
  { prefix: "/forgot-password", target: process.env.UPSTREAM_AUTH ?? "http://authzone:3000" },
  { prefix: "/auth",            target: process.env.UPSTREAM_AUTH ?? "http://authzone:3000" },
  { prefix: "/profile",      target: process.env.UPSTREAM_APP       ?? "http://app:3000" },
  { prefix: "/settings",     target: process.env.UPSTREAM_APP       ?? "http://app:3000" },
  { prefix: "/",           target: process.env.UPSTREAM_UNENTER   ?? "http://app:3000" },
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
  if (res && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad Gateway");
  }
});

// ── Target resolution ─────────────────────────────────────────────────────────

function resolveTarget(req) {
  const host     = (req.headers["host"] ?? "").split(":")[0].toLowerCase();
  const pathname = (req.url ?? "/").split("?")[0];

  // 1. Host-based routing (production)
  if (ZONE_UPSTREAMS[host]) {
    return ZONE_UPSTREAMS[host];
  }

  // 2. Path-based routing (local dev / fallback)
  for (const { prefix, target } of PATH_UPSTREAMS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return target;
    }
  }

  return ZONE_UPSTREAMS[CORE_DOMAIN];
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const target = resolveTarget(req);

  // Inject zone identification header so the Next.js app knows it arrived
  // via the proxy (useful for IP extraction, logging, etc.)
  req.headers["x-forwarded-host"]   = req.headers["host"] ?? "";
  req.headers["x-proxy-version"]    = "1";

  proxy.web(req, res, { target }, (err) => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  });
});

// WebSocket (for Next.js HMR in dev and Supabase Realtime)
server.on("upgrade", (req, socket, head) => {
  const target = resolveTarget(req);
  proxy.ws(req, socket, head, { target });
});

server.listen(PROXY_PORT, PROXY_HOST, () => {
  console.log(`[proxy] listening on ${PROXY_HOST}:${PROXY_PORT}`);
  console.log("[proxy] zone upstream map:");
  for (const [host, target] of Object.entries(ZONE_UPSTREAMS)) {
    console.log(`  ${host.padEnd(36)} → ${target}`);
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[proxy] SIGTERM — shutting down");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
