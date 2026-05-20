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
//
// Docker socket proxy — exposes the local Docker daemon to the TUI over HTTP.
// Mirrors the interface of the standalone packages/agent/ container so the TUI
// can talk to both local (this server) and remote (standalone agent) environments
// through the same agentFetch() / dockerFetch() calls in agent-client.ts.
//
// Auth: HMAC-SHA256 signature (Portainer AGENT_SECRET pattern)
//   TUI sends:  X-PortainerAgent-Timestamp: <unix_seconds>
//               X-PortainerAgent-Signature: HMAC-SHA256(AGENT_SECRET, ts) hex
//   Agent verifies timestamp freshness (±5 min) then recomputes HMAC.
//
// Routes (all require valid signature):
//   GET /health              → { status, version, platform }
//   GET /docker/dashboard    → aggregated dashboard (Portainer-style)
//   *   /docker/*            → transparent proxy to /var/run/docker.sock
//
// Port: 8888  (127.0.0.1 only — exposed only to the host machine)
// ─────────────────────────────────────────────────────────────────────────────

const crypto        = require("crypto");
const { webcrypto } = crypto;
const subtle        = webcrypto.subtle;

const AGENT_VERSION = "0.1.0";
const DOCKER_SOCKET = "/var/run/docker.sock";
const AGENT_PORT    = parseInt(process.env.AGENT_PORT ?? "8888", 10);
const CLOCK_SKEW_MS = 300_000; // 5 minutes

// Paired public key persisted across proxy reloads (hot-reload safe).
// State file lives in the already-mounted /proxy-config volume.
const AGENT_STATE_FILE = "/proxy-config/agent-state.json";

// Headers to strip before forwarding to the Docker daemon.
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
  "authorization", "host",
  "x-portaineragent-timestamp", "x-portaineragent-signature",
  "x-portaineragent-publickey",
]);

// ── Dashboard aggregator ──────────────────────────────────────────────────────
// Inlined here (mirrors packages/agent-node/handler/docker/dashboard.js) so
// proxy/server.js stays a single-file bind-mount — no Dockerfile rebuild needed.
// Mirrors: api/http/handler/docker/dashboard.go  (Portainer OSS)

const COMPOSE_STACK_NAME_LABEL = "com.docker.compose.project";
const SWARM_STACK_NAME_LABEL   = "com.docker.stack.namespace";
const HIDE_STACK_LABEL         = "hide.stack";

function dockerGet(socketPath, apiPath, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: apiPath, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch (err) { reject(new Error(`Bad JSON from Docker ${apiPath}: ${err.message}`)); }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout: Docker ${apiPath}`)));
    req.end();
  });
}

async function withConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = { status: "fulfilled", value: await tasks[i]() }; }
      catch (err) { results[i] = { status: "rejected", reason: err }; }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

function getContainerStatus(state) {
  const s = { running: 0, stopped: 0, healthy: 0, unhealthy: 0 };
  if (!state) return s;
  switch (state.Status) {
    case "running":              s.running++; break;
    case "exited": case "dead":  s.stopped++; break;
  }
  if (state.Health) {
    switch (state.Health.Status) {
      case "healthy":   s.healthy++;   break;
      case "unhealthy": s.unhealthy++; break;
    }
  }
  return s;
}

async function calculateContainerStats(socketPath, containers, isSwarm = false) {
  if (isSwarm) {
    let running = 0, stopped = 0, healthy = 0, unhealthy = 0;
    for (const c of containers) {
      switch (c.State) {
        case "running":                       running++;  break;
        case "exited": case "stopped":        stopped++;  break;
      }
      if (c.Status?.includes("(healthy)"))   healthy++;
      if (c.Status?.includes("(unhealthy)")) unhealthy++;
    }
    return { total: containers.length, running, stopped, healthy, unhealthy };
  }
  const tasks = containers.map((c) => async () => {
    try {
      const inspected = await dockerGet(socketPath, `/containers/${c.Id}/json`, 5_000);
      return getContainerStatus(inspected?.State ?? null);
    } catch { return null; }
  });
  const settled = await withConcurrency(tasks, 5);
  let running = 0, stopped = 0, healthy = 0, unhealthy = 0, total = 0;
  for (const result of settled) {
    if (result.status !== "fulfilled" || result.value === null) continue;
    const s = result.value;
    running   += s.running;
    stopped   += s.stopped;
    healthy   += s.healthy;
    unhealthy += s.unhealthy;
    total++;
  }
  return { total, running, stopped, healthy, unhealthy };
}

function getDockerStacks(containers, services = []) {
  const stacksNameSet = new Set();
  for (const c of containers) {
    const labels = c.Labels ?? {};
    if (labels[HIDE_STACK_LABEL]) continue;
    const name = labels[COMPOSE_STACK_NAME_LABEL];
    if (name) stacksNameSet.add(name);
  }
  for (const svc of services) {
    const labels = svc.Spec?.Labels ?? {};
    if (labels[HIDE_STACK_LABEL]) continue;
    const name = labels[SWARM_STACK_NAME_LABEL];
    if (name) stacksNameSet.add(name);
  }
  return stacksNameSet.size;
}

async function buildDashboard(socketPath) {
  const [containers, images, volumeBody, networks, info] = await Promise.all([
    dockerGet(socketPath, "/containers/json?all=1"),
    dockerGet(socketPath, "/images/json"),
    dockerGet(socketPath, "/volumes"),
    dockerGet(socketPath, "/networks"),
    dockerGet(socketPath, "/info"),
  ]);
  const isSwarm = !!(info?.Swarm?.ControlAvailable);
  let services = [];
  if (isSwarm) {
    try { services = await dockerGet(socketPath, "/services") ?? []; } catch {}
  }
  const safeContainers = Array.isArray(containers) ? containers : [];
  const safeImages     = Array.isArray(images)     ? images     : [];
  const safeNetworks   = Array.isArray(networks)   ? networks   : [];
  const safeServices   = Array.isArray(services)   ? services   : [];
  const containerStats = await calculateContainerStats(socketPath, safeContainers, isSwarm);
  const totalImageSize = safeImages.reduce((sum, img) => sum + (img.Size ?? 0), 0);
  return {
    containers: containerStats,
    services:   safeServices.length,
    images:     { total: safeImages.length, size: totalImageSize },
    volumes:    volumeBody?.Volumes?.length ?? 0,
    networks:   safeNetworks.length,
    stacks:     getDockerStacks(safeContainers, safeServices),
    info: {
      dockerVersion: info?.ServerVersion   ?? "",
      apiVersion:    info?.ApiVersion      ?? "",
      cpu:           info?.NCPU            ?? 0,
      memory:        info?.MemTotal        ?? 0,
      swarm:         isSwarm,
      os:            info?.OperatingSystem ?? "",
      kernel:        info?.KernelVersion   ?? "",
    },
  };
}

// ── TOFU (Trust on First Use) pairing ────────────────────────────────────────
//
// On first connection the TUI sends its public key in X-PortainerAgent-PublicKey.
// We store it and verify all future requests against it.
// No AGENT_SECRET needed — zero-config deploy.

let pairedPublicKey = null; // CryptoKey, loaded from state file or set on first pair

/** Persist the paired public key (base64) to the state file. */
function persistPairedKey(pubKeyB64) {
  try {
    fs.writeFileSync(AGENT_STATE_FILE, JSON.stringify({ pairedPublicKeyB64: pubKeyB64 }), "utf-8");
  } catch (err) {
    console.warn("[agent] could not persist paired key:", err.message);
  }
}

/** Import a raw P-256 public key from base64. */
async function importPublicKey(pubKeyB64) {
  const raw = Buffer.from(pubKeyB64, "base64");
  return subtle.importKey(
    "raw", raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["verify"],
  );
}

// Load any persisted pairing on startup.
(async () => {
  try {
    const state = JSON.parse(fs.readFileSync(AGENT_STATE_FILE, "utf-8"));
    if (state.pairedPublicKeyB64) {
      pairedPublicKey = await importPublicKey(state.pairedPublicKeyB64);
      console.log("[agent] Restored pairing from state file ✓");
    }
  } catch {
    console.log("[agent] No prior pairing found — waiting for first TUI connection (TOFU)");
  }
})();

/**
 * TOFU auth check for every incoming agent request.
 * Returns null if authorized, or { status, body } if not.
 */
async function checkAgentAuth(req) {
  const pubKeyB64 = req.headers["x-portaineragent-publickey"];
  const ts        = req.headers["x-portaineragent-timestamp"];
  const sigB64    = req.headers["x-portaineragent-signature"];

  if (!ts || !sigB64) {
    return { status: 401, body: { error: "Unauthorized — X-PortainerAgent-Timestamp and X-PortainerAgent-Signature required" } };
  }

  // Timestamp freshness check (replay protection)
  const tsMs = parseInt(ts, 10) * 1000;
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > CLOCK_SKEW_MS) {
    return { status: 401, body: { error: "Unauthorized — timestamp expired or invalid" } };
  }

  // TOFU: if not yet paired and a public key is provided, pair now.
  if (!pairedPublicKey && pubKeyB64) {
    try {
      pairedPublicKey = await importPublicKey(pubKeyB64);
      persistPairedKey(pubKeyB64);
      console.log("[agent] TOFU: paired with TUI — public key stored ✓");
    } catch (err) {
      return { status: 400, body: { error: "TOFU pairing failed — invalid public key", detail: err.message } };
    }
  }

  if (!pairedPublicKey) {
    return { status: 401, body: { error: "Agent not paired — connect from UNAXIS TUI to pair (TOFU)" } };
  }

  // Verify ECDSA-SHA256 signature over the timestamp.
  try {
    const sigBytes = Buffer.from(sigB64, "base64");
    const valid    = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pairedPublicKey,
      sigBytes,
      new TextEncoder().encode(ts),
    );
    if (!valid) {
      return { status: 401, body: { error: "Unauthorized — signature mismatch" } };
    }
  } catch {
    return { status: 401, body: { error: "Unauthorized — signature verification failed" } };
  }

  return null; // authorized
}

/**
 * Proxy a request to the Docker Unix socket.
 * dockerPath is the path AFTER stripping /docker, e.g. "/v1.43/containers/json".
 */
function proxyToDocker(req, res, dockerPath) {
  const parsedUrl = new URL(`http://localhost${req.url}`);
  const search    = parsedUrl.search ?? "";

  // Build forwarded headers — strip hop-by-hop and agent auth headers.
  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) forwardHeaders[key] = val;
  }

  const options = {
    socketPath: DOCKER_SOCKET,
    path:       `${dockerPath}${search}`,
    method:     req.method,
    headers:    forwardHeaders,
  };

  const upstream = http.request(options, (upstreamRes) => {
    // Strip hop-by-hop from upstream response headers.
    const responseHeaders = {};
    for (const [key, val] of Object.entries(upstreamRes.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders[key] = val;
    }
    responseHeaders["x-unaxis-agent"] = "v0-embedded";

    res.writeHead(upstreamRes.statusCode, responseHeaders);
    upstreamRes.pipe(res, { end: true });
  });

  upstream.on("error", (err) => {
    console.error("[agent] docker socket error:", err.message);
    if (res.headersSent) { res.destroy(); return; }

    if (err.code === "ENOENT" || err.message.includes("no such file")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Docker socket not found", detail: `Cannot connect to ${DOCKER_SOCKET} — is Docker running?` }));
    } else if (err.code === "EACCES" || err.message.includes("permission denied")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Docker socket permission denied", detail: `Check volume mount and container user permissions.` }));
    } else {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream Docker error", detail: err.message }));
    }
  });

  // Pipe request body for methods that carry one.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    req.pipe(upstream, { end: true });
  } else {
    upstream.end();
  }
}

const agentServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  checkAgentAuth(req).then((denied) => {
    if (denied) {
      res.writeHead(denied.status);
      res.end(JSON.stringify(denied.body));
      return;
    }

    // GET /health
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "online", version: AGENT_VERSION, platform: process.platform }));
      return;
    }

    const url = req.url ?? "/";

    // GET /docker/dashboard — aggregated dashboard (must come before generic /docker/* proxy)
    // Mirrors: GET /api/endpoints/{id}/docker/dashboard in Portainer
    if (req.method === "GET" && url === "/docker/dashboard") {
      buildDashboard(DOCKER_SOCKET)
        .then((data) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        })
        .catch((err) => {
          console.error("[agent] dashboard error:", err.message);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Dashboard aggregation failed", detail: err.message }));
        });
      return;
    }

    // * /docker/*  →  Docker socket proxy
    if (url.startsWith("/docker/")) {
      proxyToDocker(req, res, url.slice("/docker".length));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found", routes: ["GET /health", "GET /docker/dashboard", "* /docker/*"], version: AGENT_VERSION }));
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal server error", detail: err.message }));
    }
  });
});

agentServer.listen(AGENT_PORT, "0.0.0.0", () => {
  console.log(`[agent] v${AGENT_VERSION} listening on 0.0.0.0:${AGENT_PORT}`);
  console.log(`[agent] Auth: TOFU (Trust on First Use) — deploy agent with zero config`);
  console.log(`[agent] Routes: GET /health  |  GET /docker/dashboard  |  * /docker/*`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[proxy] SIGTERM — shutting down");
  server.close();
  adminServer.close();
  agentServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close();
  adminServer.close();
  agentServer.close(() => process.exit(0));
});
