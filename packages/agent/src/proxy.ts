// packages/agent/src/proxy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Wildcard proxy:  /docker/* → unix:///var/run/docker.sock
//
// Design (v0):
//   - Strip the /docker prefix from the incoming path.
//   - Forward the full request (method, headers, body, query string) to the
//     Docker daemon via its Unix socket using Bun's fetch() unix extension.
//   - Pipe the raw response (status, headers, body) back to the caller without
//     modification so that dockerode (and any other Docker SDK client) gets
//     exactly the bytes it expects.
//
// Streaming:
//   - Docker API responses include both short JSON blobs and long-running
//     streams (logs --follow, events, image pull progress).
//   - Piping upstream.body directly as the response body handles all cases
//     correctly — Bun streams the body without buffering the whole response.
//
// Not supported in v0 (returns 501):
//   - HTTP Upgrade / WebSocket exec/attach — these require a bidirectional
//     connection upgrade which needs separate handling.  Skipped per spec.
//
// Security note:
//   - Auth is checked BEFORE this function is called (see index.ts).
//   - This function assumes the request has already been authorized.
// ─────────────────────────────────────────────────────────────────────────────

// Docker socket path — matches the volume mount in the Dockerfile / docker run cmd.
const DOCKER_SOCKET =
  process.platform === "win32"
    ? "//./pipe/docker_engine"
    : "/var/run/docker.sock";

// Headers that must not be forwarded to the upstream Docker daemon.
// These are hop-by-hop or agent-internal headers.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "authorization",        // strip our Bearer token — Docker doesn't need it
  "host",                 // Bun sets this correctly for the socket request
]);

/**
 * Handle a request to /docker/<path>.
 *
 * @param req      The incoming request (already authorized)
 * @param dockerPath  The path AFTER stripping /docker  e.g. "/v1.43/containers/json"
 */
export async function handleDockerProxy(req: Request, dockerPath: string): Promise<Response> {
  // Reject HTTP Upgrade requests (exec/attach/websocket) — not in v0 scope.
  const upgradeHeader = req.headers.get("Upgrade");
  if (upgradeHeader) {
    return new Response(
      JSON.stringify({
        error:  "WebSocket/exec upgrades are not supported in unaxis/agent v0",
        detail: "Interactive exec and attach are planned for v1.",
      }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  // Reconstruct the full URL: http://localhost<path><search>
  const incoming    = new URL(req.url);
  const upstreamUrl = `http://localhost${dockerPath}${incoming.search}`;

  // Build forwarded headers — strip hop-by-hop and agent-internal ones.
  const forwardHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method:  req.method,
      headers: forwardHeaders,
      // Only attach body for methods that carry one.
      body:    ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : req.body,
      // Bun-specific extension: connect to Unix socket instead of TCP.
      // @ts-ignore — Bun fetch extension, not in the standard fetch type
      unix:    DOCKER_SOCKET,
      // Forward the AbortSignal so the client can cancel (e.g. closing logs tab)
      signal:  req.signal,
      // Disable Bun's automatic decompression so we pipe compressed responses as-is.
      // Without this, Bun would decompress and re-send without Content-Encoding.
      // @ts-ignore — Bun fetch extension
      decompress: false,
    });

    // Build response headers — strip hop-by-hop from the upstream response.
    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers.entries()) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    // Add CORS header so a future web UI can also use this agent.
    responseHeaders.set("X-Unaxis-Agent", "v0");

    return new Response(upstream.body, {
      status:  upstream.status,
      headers: responseHeaders,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Common failure: Docker daemon is not running or socket doesn't exist.
    if (message.includes("ENOENT") || message.includes("no such file")) {
      return new Response(
        JSON.stringify({
          error:  "Docker socket not found",
          detail: `Cannot connect to ${DOCKER_SOCKET} — is Docker running?`,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Common failure: permission denied on the socket.
    if (message.includes("EACCES") || message.includes("permission denied")) {
      return new Response(
        JSON.stringify({
          error:  "Docker socket permission denied",
          detail: `The agent process cannot read ${DOCKER_SOCKET}. Check the volume mount and user permissions.`,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    process.stderr.write(`[unaxis-agent] proxy error: ${message}\n`);
    return new Response(
      JSON.stringify({ error: "Upstream Docker error", detail: message }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
