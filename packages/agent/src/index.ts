// packages/agent/src/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS Agent v0 — entrypoint.
//
// Bun.serve() router:
//   GET  /health       → reachability + version (auth required)
//   *    /docker/*     → proxy to local Docker socket (auth required)
//   *    *             → 404
//
// Environment variables:
//   AGENT_SECRET   Required. Shared secret for HMAC-SHA256 request signing.
//                  Must match the AGENT_SECRET set on the TUI machine.
//   AGENT_PORT     Optional. Default: 8001.
//   AGENT_HOST     Optional. Default: 0.0.0.0 (all interfaces).
//
// Security:
//   All routes require X-PortainerAgent-Signature + X-PortainerAgent-Timestamp
//   headers signed with AGENT_SECRET.  Never expose this port on the public
//   internet.  Run only on trusted private networks (LAN, VPN, Tailscale).
//
// Docker install:
//   docker run -d \
//     --name unaxis_agent \
//     --restart unless-stopped \
//     -p 8001:8001 \
//     -v /var/run/docker.sock:/var/run/docker.sock \
//     -e AGENT_SECRET="your-secure-secret" \
//     unaxis/agent:v0
// ─────────────────────────────────────────────────────────────────────────────

import { checkAuth }          from "./auth.ts";
import { handleHealth }       from "./health.ts";
import { handleDockerProxy }  from "./proxy.ts";
import { AGENT_VERSION }      from "./version.ts";

const PORT = parseInt(process.env["AGENT_PORT"] ?? "8001", 10);
const HOST = process.env["AGENT_HOST"] ?? "0.0.0.0";

// ── Request router ────────────────────────────────────────────────────────────

async function router(req: Request): Promise<Response> {
  const url      = new URL(req.url);
  const pathname = url.pathname;

  // All routes require auth (async HMAC verification).
  const denied = await checkAuth(req);
  if (denied) return denied;

  // GET /health
  if (req.method === "GET" && pathname === "/health") {
    return handleHealth();
  }

  // * /docker/*  →  Docker daemon proxy
  if (pathname.startsWith("/docker/")) {
    const dockerPath = pathname.slice("/docker".length); // e.g. /v1.43/containers/json
    return handleDockerProxy(req, dockerPath);
  }

  // Fallback 404
  return new Response(
    JSON.stringify({
      error:    "Not found",
      routes:   ["GET /health", "* /docker/*"],
      version:  AGENT_VERSION,
    }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port:     PORT,
  hostname: HOST,
  fetch:    router,

  error(err) {
    process.stderr.write(`[unaxis-agent] unhandled server error: ${err.message}\n`);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  },
});

process.stdout.write(
  `[unaxis-agent] v${AGENT_VERSION} listening on ${HOST}:${PORT}\n` +
  `[unaxis-agent] Routes: GET /health  |  * /docker/*\n` +
  (process.env["AGENT_SECRET"]
    ? `[unaxis-agent] Auth: AGENT_SECRET configured ✓\n`
    : `[unaxis-agent] Auth: ⚠ AGENT_SECRET is not set — all requests will be rejected\n`)
);

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    process.stdout.write(`\n[unaxis-agent] Received ${sig}, shutting down…\n`);
    server.stop(true);
    process.exit(0);
  });
}
