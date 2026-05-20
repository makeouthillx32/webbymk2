// packages/agent-node/agent.js
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS Agent — standalone Docker socket proxy.
// Auth: Trust on First Use (TOFU) with ECDSA P-256. Zero configuration needed.
//
// Deploy on any remote machine:
//   docker run -d \
//     --name unaxis_agent \
//     --restart unless-stopped \
//     -p 8888:8888 \
//     -v /var/run/docker.sock:/var/run/docker.sock \
//     --group-add $(stat -c '%g' /var/run/docker.sock) \
//     ghcr.io/makeouthillx32/unaxis-agent:v0
//
// No AGENT_SECRET. No configuration. The first UNAXIS TUI to connect pairs
// itself via TOFU — all subsequent requests must be signed by that TUI's
// private key. Anyone else is rejected.
//
// Pairing is persisted to /data/agent-state.json (mount a volume to survive
// container restarts — optional for dev, recommended for production).
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const http          = require("http");
const fs            = require("fs");
const { webcrypto } = require("crypto");
const subtle        = webcrypto.subtle;

const { buildDashboard } = require("./handler/docker/dashboard.js");

const AGENT_VERSION = "0.1.0";
const AGENT_PORT    = parseInt(process.env.AGENT_PORT ?? "8888", 10);
const AGENT_HOST    = process.env.AGENT_HOST ?? "0.0.0.0";
const DOCKER_SOCKET = process.platform === "win32"
  ? "\\\\.\\pipe\\docker_engine"
  : "/var/run/docker.sock";
const STATE_FILE    = "/data/agent-state.json";
const CLOCK_SKEW_MS = 300_000; // 5 minutes

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
  "authorization", "host",
  "x-portaineragent-timestamp", "x-portaineragent-signature",
  "x-portaineragent-publickey",
]);

// ── TOFU pairing state ────────────────────────────────────────────────────────

let pairedPublicKey = null; // CryptoKey — null until first TUI connects

function persistPairedKey(pubKeyB64) {
  try {
    fs.mkdirSync("/data", { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pairedPublicKeyB64: pubKeyB64 }), "utf-8");
  } catch (err) {
    process.stderr.write(`[unaxis-agent] could not persist paired key: ${err.message}\n`);
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
      process.stdout.write("[unaxis-agent] Restored pairing from state file ✓\n");
    }
  } catch {
    process.stdout.write("[unaxis-agent] No prior pairing — waiting for first TUI connection (TOFU)\n");
  }
})();

// ── Auth ──────────────────────────────────────────────────────────────────────

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

  // TOFU: pair on first connection
  if (!pairedPublicKey && pubKeyB64) {
    try {
      pairedPublicKey = await importPublicKey(pubKeyB64);
      persistPairedKey(pubKeyB64);
      process.stdout.write("[unaxis-agent] TOFU: paired with TUI ✓\n");
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

// ── Docker proxy ──────────────────────────────────────────────────────────────

function proxyToDocker(req, res, dockerPath) {
  const parsedUrl = new URL(`http://localhost${req.url}`);

  const forwardHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) forwardHeaders[key] = val;
  }

  const upstream = http.request({
    socketPath: DOCKER_SOCKET,
    path:       `${dockerPath}${parsedUrl.search ?? ""}`,
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
    process.stderr.write(`[unaxis-agent] docker error: ${err.message}\n`);
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

// ── Router ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  checkAuth(req).then((denied) => {
    if (denied) {
      res.writeHead(denied.status);
      res.end(JSON.stringify(denied.body));
      return;
    }

    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "online", version: AGENT_VERSION, platform: process.platform }));
      return;
    }

    // ── Dashboard aggregator (must be before the generic /docker/* proxy) ──
    // Mirrors: GET /api/endpoints/{id}/docker/dashboard in Portainer
    if (req.method === "GET" && url === "/docker/dashboard") {
      buildDashboard(DOCKER_SOCKET)
        .then((data) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        })
        .catch((err) => {
          process.stderr.write(`[unaxis-agent] dashboard error: ${err.message}\n`);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Dashboard aggregation failed", detail: err.message }));
        });
      return;
    }

    if (url.startsWith("/docker/")) {
      proxyToDocker(req, res, url.slice("/docker".length));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found", routes: ["GET /health", "* /docker/*"], version: AGENT_VERSION }));
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal server error", detail: err.message }));
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(AGENT_PORT, AGENT_HOST, () => {
  process.stdout.write(
    `[unaxis-agent] v${AGENT_VERSION} listening on ${AGENT_HOST}:${AGENT_PORT}\n` +
    `[unaxis-agent] Auth: TOFU — deploy with zero config, first TUI to connect pairs automatically\n` +
    `[unaxis-agent] Routes: GET /health  |  GET /docker/dashboard  |  * /docker/*\n`
  );
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT",  () => { server.close(() => process.exit(0)); });
