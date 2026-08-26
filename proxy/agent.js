// proxy/agent.js
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS Agent — unified agent module.
//
// ONE file, ONE version, two runtime contexts:
//   • Embedded  — required by proxy/server.js on POWER (local-docker).
//                 State persisted to /proxy-config/agent-state.json.
//                 Hot-reloaded via node --watch on save.
//   • Standalone — COPY'd into packages/agent-node/ Docker image for remote
//                 nodes (L0V3 / remote-docker). State in /data/agent-state.json.
//                 Updated via TUI [u] → build+push → POST /self-update.
//
// Auth: ECDSA P-256 TOFU (Trust on First Use) — zero configuration.
//
// Routes (all require valid TOFU signature):
//   GET  /health            → { status, version, platform, engine, host }
//   GET  /db/status         → self-reported Supabase stacks (per-service state+health)
//   GET  /zones/status      → self-reported unt_* zone containers
//   GET  /proxy/status      → self-reported proxy / NPM containers
//   GET  /docker/dashboard  → aggregated dashboard (Portainer-style)
//   POST /stacks/deploy     → docker compose up -d  { name, yaml }
//   POST /self-update       → rolling self-replacement via updater container { ref }
//   *    /docker/*          → transparent Docker socket proxy
//
// Configuration (via environment variables):
//   AGENT_PORT        Port to listen on           (default: 8888)
//   AGENT_HOST        Bind address                (default: 0.0.0.0)
//   AGENT_STATE_FILE  TOFU pairing state path     (default: /data/agent-state.json)
//                     Proxy sets this to /proxy-config/agent-state.json.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const http          = require("http");
const fs            = require("fs");
const os            = require("os");
const path          = require("path");
const { spawn }     = require("child_process");
const { webcrypto } = require("crypto");
const subtle        = webcrypto.subtle;

// ── Constants ──────────────────────────────────────────────────────────────────

const AGENT_VERSION = "1.2.0";
const UPDATER_IMAGE = "ghcr.io/makeouthillx32/unaxis-updater:v0";

const AGENT_PORT    = parseInt(process.env.AGENT_PORT    ?? "8888", 10);
const AGENT_HOST    = process.env.AGENT_HOST             ?? "0.0.0.0";
const DOCKER_SOCKET = process.platform === "win32"
  ? "\\\\.\\pipe\\docker_engine"
  : "/var/run/docker.sock";

// State file location is context-dependent — set via env var:
//   Proxy (embedded):  AGENT_STATE_FILE=/proxy-config/agent-state.json
//   Standalone:        default → /data/agent-state.json
const STATE_FILE    = process.env.AGENT_STATE_FILE ?? "/data/agent-state.json";

const CLOCK_SKEW_MS = 300_000; // 5 minutes

// Headers stripped before forwarding to Docker or responding to the TUI.
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
  "authorization", "host",
  "x-portaineragent-timestamp", "x-portaineragent-signature",
  "x-portaineragent-publickey",
]);

// ── Concurrent update lock ─────────────────────────────────────────────────────
// Prevents two /self-update calls from racing.  Auto-releases after 3 minutes
// as a safety net (e.g. agent survives but updater container hangs).

let updateInProgress = false;
let updateLockTimer  = null;

function acquireUpdateLock() {
  if (updateInProgress) return false;
  updateInProgress = true;
  updateLockTimer  = setTimeout(() => { updateInProgress = false; }, 3 * 60 * 1000);
  return true;
}

function releaseUpdateLock() {
  clearTimeout(updateLockTimer);
  updateInProgress = false;
}

// ── Structured logger ──────────────────────────────────────────────────────────
// Format mirrors Portainer's zerolog output for familiarity in shared logs.

const LOG_SRC = "proxy/agent.js";

function fmtTimestamp() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  let   hh   = now.getHours();
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  const min  = String(now.getMinutes()).padStart(2, "0");
  const sec  = String(now.getSeconds()).padStart(2, "0");
  const ms   = String(now.getMilliseconds()).padStart(3, "0");
  return `${yyyy}/${mm}/${dd} ${String(hh).padStart(2, "0")}:${min}:${sec}.${ms}${ampm}`;
}

function fmtKv(kv) {
  if (!kv || Object.keys(kv).length === 0) return "|";
  return "| " + Object.entries(kv).map(([k, v]) => `${k}=${v}`).join(" ");
}

function writeLine(level, msg, kv) {
  const out = (level === "ERR" || level === "WRN") ? process.stderr : process.stdout;
  out.write(`${fmtTimestamp()} ${level} ${LOG_SRC} > ${msg} ${fmtKv(kv)}\n`);
}

const log = {
  inf: (msg, kv) => writeLine("INF", msg, kv),
  wrn: (msg, kv) => writeLine("WRN", msg, kv),
  err: (msg, kv) => writeLine("ERR", msg, kv),
};

// ── Dashboard aggregator ───────────────────────────────────────────────────────
// Mirrors: api/http/handler/docker/dashboard.go (Portainer OSS)
// Inlined so this file stays self-contained in both runtime contexts.

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

// ── Engine state probe ─────────────────────────────────────────────────────────
// Self-reported Docker engine state — the agent sits ON the host, so it can
// tell the TUI exactly what's happening instead of the TUI inferring from
// outside. Surfaced in GET /health as { engine: { state, latencyMs, error } }.
//
//   up      engine answered /_ping
//   wedged  /_ping timed out — daemon hung (zombie containerd task)
//   off     socket/pipe refused or missing — Docker stopped or paused
//   error   anything else (permissions, protocol)

function dockerPingRaw(socketPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: "/_ping", method: "GET" },
      (res) => {
        res.resume(); // drain — body is just "OK"
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs ?? 3000, () => req.destroy(new Error("ETIMEOUT: Docker /_ping")));
    req.end();
  });
}

async function probeEngineState() {
  const started = Date.now();
  try {
    const status = await dockerPingRaw(DOCKER_SOCKET, 3000);
    if (status >= 200 && status < 300) {
      return { state: "up", latencyMs: Date.now() - started, error: null };
    }
    return { state: "error", latencyMs: Date.now() - started, error: "HTTP " + status };
  } catch (err) {
    const msg  = err && err.message ? err.message : String(err);
    const code = err && err.code ? err.code : "";
    if (msg.indexOf("ETIMEOUT") === 0) {
      return { state: "wedged", latencyMs: null, error: "engine ping timed out — daemon hung" };
    }
    if (code === "ENOENT" || code === "ECONNREFUSED" || code === "EPIPE" || code === "EACCES") {
      return { state: "off", latencyMs: null, error: "socket " + code + " — Docker stopped or paused" };
    }
    return { state: "error", latencyMs: null, error: msg };
  }
}

function hostSnapshot() {
  return {
    uptimeSec:  Math.floor(os.uptime()),
    memTotalMb: Math.round(os.totalmem() / 1048576),
    memFreeMb:  Math.round(os.freemem() / 1048576),
    cpus:       os.cpus().length,
    loadAvg1m:  os.loadavg()[0],
  };
}

// ── Self-report status endpoints ──────────────────────────────────────────────
// The agent sits on the node, so it reports its own stacks instead of the TUI
// probing from outside. Everything below derives from ONE /containers/json
// call — no localhost port assumptions, works identically on every node.
//
//   GET /db/status     Supabase stacks (fingerprint: compose project with both
//                      a "db" and a "kong" service) — per-service state+health
//   GET /zones/status  unt_* zone containers — state, health, image, uptime
//   GET /proxy/status  proxy / NPM containers — state + health
//                      (cert expiry + route targets = v2, needs NPM API creds)

function containerBrief(c) {
  const name = (c.Names && c.Names[0] ? c.Names[0] : "").replace(/^\//, "");
  return {
    name,
    service: (c.Labels && c.Labels["com.docker.compose.service"]) || name,
    state:   c.State ?? "unknown",                       // running/exited/paused/restarting/dead
    healthy: c.Status ? (c.Status.includes("(unhealthy)") ? false
             : c.Status.includes("(healthy)") ? true : null) : null,
    image:   c.Image ?? "",
    status:  c.Status ?? "",                             // human string, includes uptime
  };
}

function rollup(briefs) {
  const running = briefs.filter((b) => b.state === "running").length;
  const unhealthy = briefs.filter((b) => b.healthy === false).length;
  return {
    total: briefs.length, running, unhealthy,
    state: briefs.length === 0 ? "empty"
         : unhealthy > 0 ? "degraded"
         : running === briefs.length ? "up"
         : running > 0 ? "partial" : "down",
  };
}

async function buildDbStatus() {
  const containers = await dockerGet(DOCKER_SOCKET, "/containers/json?all=1");
  const byProject = new Map();
  for (const c of containers) {
    const project = c.Labels && c.Labels[COMPOSE_STACK_NAME_LABEL];
    if (!project) continue;
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project).push(c);
  }
  const stacks = [];
  for (const [project, list] of byProject) {
    const services = new Set(list.map((c) => c.Labels[ "com.docker.compose.service"] ?? ""));
    // Supabase fingerprint: has both a database and a kong gateway service.
    const looksSupabase = [...services].some((s) => s === "db" || s.startsWith("db"))
                       && [...services].some((s) => s === "kong" || s.startsWith("kong"));
    if (!looksSupabase) continue;
    const briefs = list.map(containerBrief);
    stacks.push({ stack: project, ...rollup(briefs), services: briefs });
  }
  return { stacks, probedAt: new Date().toISOString() };
}

async function buildZonesStatus() {
  const containers = await dockerGet(DOCKER_SOCKET, "/containers/json?all=1");
  const zones = containers
    .filter((c) => (c.Names ?? []).some((n) => n.replace(/^\//, "").startsWith("unt_")))
    .map(containerBrief);
  return { ...rollup(zones), zones, probedAt: new Date().toISOString() };
}

async function buildProxyStatus() {
  const containers = await dockerGet(DOCKER_SOCKET, "/containers/json?all=1");
  const isProxyish = (c) => {
    const name  = (c.Names && c.Names[0] ? c.Names[0] : "").replace(/^\//, "").toLowerCase();
    const image = (c.Image ?? "").toLowerCase();
    return name === "proxy" || name.includes("nginx-proxy") || name.includes("npm")
        || image.includes("nginx-proxy-manager") || image.includes("jc21/nginx");
  };
  const proxies = containers.filter(isProxyish).map(containerBrief);
  return {
    ...rollup(proxies), proxies,
    notes: "container-level only; cert expiry + route targets need NPM API creds (v2)",
    probedAt: new Date().toISOString(),
  };
}

// ── Status-page collector ────────────────────────────────────────────────────
// Periodically samples every unt_*/srt-* container this node can see and
// appends one entry per service to a local JSON history file — UNAXIS's own
// data, deliberately NOT stored in db.unenter.live (that database is scoped
// to unenter.live application data only; the one exception is the public
// zones catalog, which UNAXIS already owns for a different reason). The
// public status page (status.unenter.live, Vercel-hosted) reads this via a
// key-gated read-only endpoint proxied through server.js — see
// getPublicStatusSnapshot() and STATUS_PUBLIC_KEY below.

const STATUS_HISTORY_FILE        = process.env.STATUS_HISTORY_FILE || path.join(path.dirname(STATE_FILE), "status-history.json");
const STATUS_INCIDENTS_FILE      = process.env.STATUS_INCIDENTS_FILE || path.join(path.dirname(STATE_FILE), "status-incidents.json");
const STATUS_PUBLIC_KEY          = process.env.STATUS_PUBLIC_KEY || "";
const STATUS_COLLECT_INTERVAL_MS = 60_000;
const STATUS_RETENTION_MS        = 90 * 24 * 60 * 60 * 1000; // 90 days

const STATUS_DB_SERVICES    = new Set(["kong", "db", "auth", "rest", "realtime", "storage", "meta", "studio", "imgproxy"]);
const STATUS_CORE_SERVICES  = new Set(["app"]);
const STATUS_INFRA_SERVICES = new Set(["mediamtx"]);
const STATUS_RANK           = { operational: 0, degraded: 1, down: 2 };

// statusContainerBrief was a slimmed duplicate of containerBrief() (defined
// above, in the self-report status endpoints) — same name/state/healthy
// fields, just missing the service/image/status ones containerBrief also
// carries. Removed in favor of reusing that one function everywhere.
function classifyStatusService(name) {
  if (name.startsWith("srt-")) return "cameras";
  if (!name.startsWith("unt_")) return null; // not ours (e.g. buildx builder container)
  const bare = name.replace(/^unt_/, "");
  if (STATUS_DB_SERVICES.has(bare))    return "database";
  if (STATUS_CORE_SERVICES.has(bare))  return "core";
  if (STATUS_INFRA_SERVICES.has(bare)) return "media-gateway";
  if (bare === "proxy")                return "proxy";
  return `zone:${bare}`;
}

const STATUS_GROUP_LABELS = {
  core:            "Core Application",
  database:        "Database & API",
  proxy:            "Edge Proxy",
  cameras:          "Live Camera Ingest",
  "media-gateway":  "Media Gateway",
};
function statusGroupLabel(groupId) {
  if (STATUS_GROUP_LABELS[groupId]) return STATUS_GROUP_LABELS[groupId];
  if (groupId.startsWith("zone:")) {
    const key = groupId.slice("zone:".length);
    return `${key.split(/[-_]/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ")} Zone`;
  }
  return groupId;
}

function statusFromBrief(brief) {
  if (brief.state !== "running") return "down";
  if (brief.healthy === false)   return "degraded";
  return "operational";
}

function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function writeJsonSafe(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}

async function collectStatusSnapshot() {
  try {
    const containers = await dockerGet(DOCKER_SOCKET, "/containers/json?all=1");
    const now = Date.now();
    const groupStatus = new Map(); // groupId -> worst status this sample

    for (const c of containers) {
      const brief = containerBrief(c);
      const groupId = classifyStatusService(brief.name);
      if (!groupId) continue;
      const status = statusFromBrief(brief);
      const prev = groupStatus.get(groupId);
      groupStatus.set(groupId, !prev || STATUS_RANK[status] > STATUS_RANK[prev] ? status : prev);
    }
    if (groupStatus.size === 0) return;

    const history = readJsonSafe(STATUS_HISTORY_FILE, []);
    for (const [groupId, status] of groupStatus) {
      history.push({ g: groupId, s: status, t: now });
    }
    const cutoff = now - STATUS_RETENTION_MS;
    writeJsonSafe(STATUS_HISTORY_FILE, history.filter((e) => e.t >= cutoff));
  } catch (err) {
    log.err("status collector: sample failed", { error: err.message });
  }
}

// ── Public snapshot — current status + 90-day daily rollup + incidents ──────

function getPublicStatusSnapshot() {
  const history = readJsonSafe(STATUS_HISTORY_FILE, []);
  const incidents = readJsonSafe(STATUS_INCIDENTS_FILE, []);

  const latestByGroup = new Map();
  for (const e of history) {
    const prev = latestByGroup.get(e.g);
    if (!prev || e.t > prev.t) latestByGroup.set(e.g, e);
  }
  const current = [...latestByGroup.entries()]
    .map(([g, e]) => ({ id: g, label: statusGroupLabel(g), status: e.s }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  const dailyByGroup = new Map(); // groupId -> Map(day -> worst status)
  for (const e of history) {
    if (!dailyByGroup.has(e.g)) dailyByGroup.set(e.g, new Map());
    const days = dailyByGroup.get(e.g);
    const day = dayKey(e.t);
    const prev = days.get(day);
    days.set(day, !prev || STATUS_RANK[e.s] > STATUS_RANK[prev] ? e.s : prev);
  }
  const history90 = [...dailyByGroup.entries()].map(([g, days]) => ({
    id: g,
    label: statusGroupLabel(g),
    days: [...days.entries()].map(([day, status]) => ({ day, status })).sort((a, b) => a.day.localeCompare(b.day)),
  })).sort((a, b) => a.label.localeCompare(b.label));

  return { current, history: history90, incidents, generatedAt: new Date().toISOString() };
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
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
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
        case "running":                    running++;  break;
        case "exited": case "stopped":     stopped++;  break;
      }
      if (c.Status?.includes("(healthy)"))   healthy++;
      if (c.Status?.includes("(unhealthy)")) unhealthy++;
    }
    return { total: containers.length, running, stopped, healthy, unhealthy };
  }
  const tasks   = containers.map((c) => async () => {
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

// ── Updater log streaming ──────────────────────────────────────────────────────
// Attaches to the updater container's stdout/stderr and forwards each Docker
// log frame (8-byte header + payload) to the agent's structured logger.

function streamUpdaterLogs(containerId) {
  const logsReq = http.request({
    socketPath: DOCKER_SOCKET,
    path:       `/containers/${containerId}/logs?follow=1&stdout=1&stderr=1`,
    method:     "GET",
  }, (logsRes) => {
    let pending = Buffer.alloc(0);
    logsRes.on("data", (chunk) => {
      pending = Buffer.concat([pending, Buffer.from(chunk)]);
      while (pending.length >= 8) {
        const frameSize = pending.readUInt32BE(4);
        if (pending.length < 8 + frameSize) break;
        const line = pending.slice(8, 8 + frameSize).toString().trimEnd();
        if (line) log.inf("updater", { msg: line });
        pending = pending.slice(8 + frameSize);
      }
    });
    logsRes.on("end",  () => log.inf("updater", { msg: "(log stream closed)" }));
    logsRes.on("error", () => {});
  });
  logsReq.on("error", () => {});
  logsReq.end();
}

// ── TOFU pairing ──────────────────────────────────────────────────────────────

let pairedPublicKey = null; // CryptoKey — null until first TUI connects

function persistPairedKey(pubKeyB64) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pairedPublicKeyB64: pubKeyB64 }), "utf-8");
  } catch (err) {
    log.err("could not persist paired key", { error: err.message, state_file: STATE_FILE });
  }
}

async function importPublicKey(pubKeyB64) {
  return subtle.importKey(
    "raw",
    Buffer.from(pubKeyB64, "base64"),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

// Restore persisted pairing on startup.
(async () => {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    if (state.pairedPublicKeyB64) {
      pairedPublicKey = await importPublicKey(state.pairedPublicKeyB64);
      log.inf("restored pairing from state file", { state_file: STATE_FILE });
    }
  } catch {
    log.wrn("no prior pairing — waiting for first TUI connection", { auth: "tofu" });
  }
})();

// ── Auth ───────────────────────────────────────────────────────────────────────

async function checkAuth(req) {
  const pubKeyB64 = req.headers["x-portaineragent-publickey"];
  const ts        = req.headers["x-portaineragent-timestamp"];
  const sigB64    = req.headers["x-portaineragent-signature"];

  if (!ts || !sigB64) {
    return { status: 401, body: { error: "Unauthorized — X-PortainerAgent-Timestamp and X-PortainerAgent-Signature required" } };
  }

  const tsMs = parseInt(ts, 10) * 1000;
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > CLOCK_SKEW_MS) {
    return { status: 401, body: { error: "Unauthorized — timestamp expired or invalid" } };
  }

  // TOFU: pair on first connection if a public key is supplied
  if (!pairedPublicKey && pubKeyB64) {
    try {
      pairedPublicKey = await importPublicKey(pubKeyB64);
      persistPairedKey(pubKeyB64);
      log.inf("tofu pairing complete", { paired: true, persisted: true });
    } catch (err) {
      return { status: 400, body: { error: "TOFU pairing failed", detail: err.message } };
    }
  }

  if (!pairedPublicKey) {
    return { status: 401, body: { error: "Agent not paired — connect from UNAXIS TUI first (TOFU)" } };
  }

  try {
    const valid = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pairedPublicKey,
      Buffer.from(sigB64, "base64"),
      new TextEncoder().encode(ts),
    );
    if (!valid) return { status: 401, body: { error: "Unauthorized — signature mismatch" } };
  } catch {
    return { status: 401, body: { error: "Unauthorized — signature verification failed" } };
  }

  return null; // authorized
}

// ── Docker socket proxy ────────────────────────────────────────────────────────

function proxyToDocker(req, res) {
  // Strip /docker prefix; manually decode %2F→/ and %3A→: so Docker always
  // receives raw image refs (e.g. "ghcr.io/user/image:tag", never encoded).
  // Avoids WHATWG URL normalization which can double query strings on image refs.
  const rawPath    = req.url.startsWith("/docker/")
    ? req.url.slice("/docker".length)
    : req.url;
  const dockerPath = rawPath
    .replace(/%2F/gi, "/")
    .replace(/%3A/gi, ":");

  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) forwardHeaders[key] = val;
  }

  const upstream = http.request({
    socketPath: DOCKER_SOCKET,
    path:       dockerPath,
    method:     req.method,
    headers:    forwardHeaders,
  }, (upstreamRes) => {
    const responseHeaders = {};
    for (const [key, val] of Object.entries(upstreamRes.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders[key] = val;
    }
    responseHeaders["x-unaxis-agent"] = `v${AGENT_VERSION}`;
    res.writeHead(upstreamRes.statusCode, responseHeaders);
    upstreamRes.pipe(res, { end: true });
  });

  upstream.on("error", (err) => {
    log.err("docker socket error", { error: err.message, code: err.code ?? "unknown" });
    if (res.headersSent) { res.destroy(); return; }
    if (err.code === "ENOENT" || err.message.includes("no such file")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Docker socket not found", detail: `Cannot connect to ${DOCKER_SOCKET}` }));
    } else if (err.code === "EACCES" || err.message.includes("permission denied")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Docker socket permission denied" }));
    } else {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream Docker error", detail: err.message }));
    }
  });

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    req.pipe(upstream, { end: true });
  } else {
    upstream.end();
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────────

/**
 * Loopback health exemption — the image HEALTHCHECK (wget from inside the
 * container) cannot sign requests. Unsigned GET /health is allowed from
 * loopback ONLY; every other route and every remote caller still requires a
 * valid TOFU signature.
 *
 * WHY THIS EXISTS (hard-won): without it the healthcheck 401s, the container
 * reports unhealthy after ~100s, and updater.sh's health gate ROLLS BACK
 * every self-update — the TUI sees the new version answer, declares success,
 * and 100 seconds later the old agent silently resurrects. (The L0V3
 * "phantom v0.1.8" incident, 2026-07.)
 */
function isLoopbackHealthRequest(req) {
  if (req.method !== "GET") return false;
  const path = (req.url ?? "").split("?")[0];
  if (path !== "/health") return false;
  const addr = req.socket?.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

const agentServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  const authPromise = isLoopbackHealthRequest(req)
    ? Promise.resolve(null)
    : checkAuth(req);

  authPromise.then((denied) => {
    if (denied) {
      log.wrn("request rejected", { status: denied.status, method: req.method, url: req.url });
      res.writeHead(denied.status);
      res.end(JSON.stringify(denied.body));
      return;
    }

    const url = req.url ?? "/";
    log.inf("request", { method: req.method, url });

    // ── GET /health ─────────────────────────────────────────────────────────
    if (req.method === "GET" && url === "/health") {
      probeEngineState()
        .then((engine) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            status:   "online",
            version:  AGENT_VERSION,
            platform: process.platform,
            engine,
            host: hostSnapshot(),
          }));
        })
        .catch(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "online", version: AGENT_VERSION, platform: process.platform }));
        });
      return;
    }

    // ── Self-report status endpoints ────────────────────────────────────────
    // GET /db/status | /zones/status | /proxy/status — node reports its own
    // stacks. All derive from the Docker socket; safe read-only aggregations.
    if (req.method === "GET" && (url === "/db/status" || url === "/zones/status" || url === "/proxy/status")) {
      const build = url === "/db/status" ? buildDbStatus
                  : url === "/zones/status" ? buildZonesStatus
                  : buildProxyStatus;
      build()
        .then((data) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        })
        .catch((err) => {
          // Engine down/wedged → report it in-band instead of a bare 500,
          // mirroring the /health engine tile semantics.
          probeEngineState().then((engine) => {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error:  err && err.message ? err.message : String(err),
              engine,
              probedAt: new Date().toISOString(),
            }));
          });
        });
      return;
    }

    // ── GET /docker/dashboard ───────────────────────────────────────────────
    // Must come before the generic /docker/* proxy.
    if (req.method === "GET" && url === "/docker/dashboard") {
      buildDashboard(DOCKER_SOCKET)
        .then((data) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        })
        .catch((err) => {
          log.err("dashboard aggregation failed", { error: err.message });
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Dashboard aggregation failed", detail: err.message }));
        });
      return;
    }

    // ── POST /stacks/deploy  { name, yaml } ────────────────────────────────
    if (req.method === "POST" && url === "/stacks/deploy") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        let name, yaml;
        try { ({ name, yaml } = JSON.parse(body)); }
        catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
        if (!name || !yaml) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "name and yaml are required" }));
          return;
        }
        const dir         = path.join(os.tmpdir(), "unaxis-stacks", String(name));
        const composeFile = path.join(dir, "docker-compose.yml");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(composeFile, yaml, "utf-8");
        log.inf("stack deploy started", { stack: name, compose_file: composeFile });
        const logs = [];
        const proc = spawn(
          "docker",
          ["compose", "-f", composeFile, "-p", String(name), "up", "-d", "--remove-orphans"],
          { env: { ...process.env, DOCKER_HOST: `unix://${DOCKER_SOCKET}` } },
        );
        proc.stdout.on("data", (d) => { logs.push(d.toString()); });
        proc.stderr.on("data", (d) => { logs.push(d.toString()); });
        proc.on("close", (code) => {
          if (code === 0) {
            log.inf("stack deploy complete", { stack: name, exit_code: code });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, logs: logs.join("") }));
          } else {
            log.err("stack deploy failed", { stack: name, exit_code: code });
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, code, logs: logs.join("") }));
          }
        });
        proc.on("error", (err) => {
          log.err("stack deploy spawn error", { stack: name, error: err.message });
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
      });
      return;
    }

    // ── POST /self-update  { ref }  ────────────────────────────────────────
    //
    // Bootstrap-safe self-replacement via a dedicated updater container.
    // Phase 1: Pull updater + new agent images (via Docker socket API).
    // Phase 2: Create + start the updater container (separate cgroup).
    // Phase 3: Respond 202 immediately — TUI polls /health until new version.
    //
    // The updater runs in its own cgroup so when Docker kills this process
    // the updater continues and finishes the stop → rm → run sequence.
    if (req.method === "POST" && url === "/self-update") {
      if (!acquireUpdateLock()) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: "update already in progress — try again later" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        let ref;
        try { ({ ref } = JSON.parse(body)); }
        catch {
          releaseUpdateLock();
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
        if (!ref) {
          releaseUpdateLock();
          res.writeHead(400);
          res.end(JSON.stringify({ error: "ref is required (image:tag)" }));
          return;
        }

        // pullImage — POST /images/create via Docker socket (no CLI spawn).
        // Reads newline-delimited JSON progress events; checks for error key.
        const pullImage = (imageRef) => new Promise((resolve, reject) => {
          const encoded = encodeURIComponent(imageRef);
          const pullReq = http.request({
            socketPath: DOCKER_SOCKET,
            path:       `/images/create?fromImage=${encoded}`,
            method:     "POST",
            headers:    { "Content-Length": "0" },
          }, (pullRes) => {
            let lastLine = "";
            let errorMsg = null;
            pullRes.on("data", (chunk) => {
              const lines = chunk.toString().split("\n").filter(Boolean);
              for (const line of lines) {
                lastLine = line;
                try {
                  const evt = JSON.parse(line);
                  if (evt.error) errorMsg = evt.error;
                } catch { /* partial chunk */ }
              }
            });
            pullRes.on("end", () => {
              if (errorMsg)                    reject(new Error(`registry error: ${errorMsg}`));
              else if (pullRes.statusCode !== 200) reject(new Error(`HTTP ${pullRes.statusCode} — ${lastLine}`));
              else                             resolve();
            });
          });
          pullReq.on("error", (err) => reject(new Error(`socket error: ${err.message}`)));
          pullReq.end();
        });

        // Phase 1a: pull updater image
        log.inf("self-update: pulling updater image", { ref: UPDATER_IMAGE });
        try {
          await pullImage(UPDATER_IMAGE);
          log.inf("self-update: updater image ready", { ref: UPDATER_IMAGE });
        } catch (err) {
          log.err("self-update: updater pull failed", { error: err.message });
          releaseUpdateLock();
          res.writeHead(500);
          res.end(JSON.stringify({ error: "updater pull failed", detail: err.message }));
          return;
        }

        // Phase 1b: pull new agent image
        log.inf("self-update: pulling agent image", { ref });
        try {
          await pullImage(ref);
          log.inf("self-update: agent image ready", { ref });
        } catch (err) {
          log.err("self-update: agent pull failed", { error: err.message });
          releaseUpdateLock();
          res.writeHead(500);
          res.end(JSON.stringify({ error: "agent pull failed", detail: err.message }));
          return;
        }

        // Phase 2: create updater container
        const socketBind = process.platform === "win32"
          ? "\\\\.\\pipe\\docker_engine:\\\\.\\pipe\\docker_engine"
          : "/var/run/docker.sock:/var/run/docker.sock";

        const helperName = `unaxis_agent_updater_${Date.now()}`;
        const helperBody = JSON.stringify({
          Image: UPDATER_IMAGE,
          Cmd:   ["unaxis_agent", ref],   // args to updater.sh entrypoint
          HostConfig: {
            Binds:         [socketBind],
            AutoRemove:    true,
            RestartPolicy: { Name: "no" },
          },
        });

        const createHelper = () => new Promise((resolve, reject) => {
          const req2 = http.request({
            socketPath: DOCKER_SOCKET,
            path:       `/containers/create?name=${helperName}`,
            method:     "POST",
            headers:    {
              "Content-Type":   "application/json",
              "Content-Length": Buffer.byteLength(helperBody),
            },
          }, (r2) => {
            let buf = "";
            r2.on("data", (c) => { buf += c; });
            r2.on("end", () => {
              if (r2.statusCode === 201) {
                try { resolve(JSON.parse(buf).Id); }
                catch { reject(new Error("create: bad JSON")); }
              } else {
                reject(new Error(`create: HTTP ${r2.statusCode} — ${buf}`));
              }
            });
          });
          req2.on("error", reject);
          req2.end(helperBody);
        });

        const startHelper = (id) => new Promise((resolve, reject) => {
          const req3 = http.request({
            socketPath: DOCKER_SOCKET,
            path:       `/containers/${id}/start`,
            method:     "POST",
            headers:    { "Content-Length": "0" },
          }, (r3) => {
            r3.resume();
            r3.on("end", () => {
              if (r3.statusCode === 204 || r3.statusCode === 304) resolve();
              else reject(new Error(`start: HTTP ${r3.statusCode}`));
            });
          });
          req3.on("error", reject);
          req3.end();
        });

        let helperId;
        try {
          helperId = await createHelper();
          log.inf("self-update: helper container created", { id: helperId.slice(0, 12), name: helperName });
        } catch (err) {
          log.err("self-update: failed to create helper container", { error: err.message });
          releaseUpdateLock();
          res.writeHead(500);
          res.end(JSON.stringify({ error: "failed to create helper container", detail: err.message }));
          return;
        }

        // Phase 3: respond 202 BEFORE starting the helper so TUI receives it
        // even if the helper immediately kills this process.
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ref, status: "replacing", updater: helperName }));

        try {
          await startHelper(helperId);
          log.inf("self-update: helper started — standing by for replacement", { name: helperName });
          streamUpdaterLogs(helperId);
        } catch (err) {
          // Already responded 202 — log only.
          log.err("self-update: failed to start helper container", { error: err.message });
          releaseUpdateLock();
        }
      });
      return;
    }

    // ── * /docker/*  →  Docker socket proxy ───────────────────────────────
    if (url.startsWith("/docker/")) {
      proxyToDocker(req, res);
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({
      error:   "Not found",
      routes:  ["GET /health", "GET /db/status", "GET /zones/status", "GET /proxy/status", "GET /docker/dashboard", "POST /stacks/deploy", "POST /self-update", "* /docker/*"],
      version: AGENT_VERSION,
    }));
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal server error", detail: err.message }));
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────

agentServer.listen(AGENT_PORT, AGENT_HOST, () => {
  log.inf("unaxis agent started", {
    version:       AGENT_VERSION,
    addr:          AGENT_HOST,
    port:          AGENT_PORT,
    docker_socket: DOCKER_SOCKET,
    state_file:    STATE_FILE,
  });
  log.inf("auth: tofu — first tui to connect pairs automatically", { auth: "tofu" });
  log.inf("routes: GET /health | GET /db/status | GET /zones/status | GET /proxy/status | GET /docker/dashboard | POST /stacks/deploy | POST /self-update | * /docker/*", {});

  log.inf("status collector: enabled", { interval_ms: STATUS_COLLECT_INTERVAL_MS, history_file: STATUS_HISTORY_FILE });
  collectStatusSnapshot();
  setInterval(collectStatusSnapshot, STATUS_COLLECT_INTERVAL_MS);
  if (!STATUS_PUBLIC_KEY) {
    log.inf("status public endpoint: STATUS_PUBLIC_KEY not set — public status route will refuse all requests", {});
  }
});

process.on("SIGTERM", () => { agentServer.close(() => process.exit(0)); });
process.on("SIGINT",  () => { agentServer.close(() => process.exit(0)); });

// ── Exports (used by server.js to serve the public status route) ───────────

module.exports = { getPublicStatusSnapshot, STATUS_PUBLIC_KEY };
