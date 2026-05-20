// packages/agent/src/auth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Request authentication — HMAC-SHA256 signature verification.
//
// Security model (v0, mirrors Portainer's AGENT_SECRET pattern):
//   - Both the TUI and the agent share a pre-shared secret: AGENT_SECRET.
//   - On every request the TUI sends two headers:
//       X-PortainerAgent-Timestamp: <unix seconds>
//       X-PortainerAgent-Signature: HMAC-SHA256(AGENT_SECRET, timestamp) as hex
//   - The agent recomputes the HMAC and rejects:
//       - Missing or malformed headers                   → 401
//       - HMAC mismatch                                  → 401
//       - Timestamp older than CLOCK_SKEW_S seconds      → 401  (replay protection)
//       - AGENT_SECRET not set at startup                → 503
//
// Environment variable:
//   AGENT_SECRET   Required. Must be identical on both the TUI machine and
//                  the agent container.  Pass at runtime only — never bake
//                  into the image.
//
// Naming follows Portainer convention deliberately so tooling written against
// Portainer agents is recognisable here.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = process.env["AGENT_SECRET"]?.trim() ?? "";

// Maximum clock skew between TUI and agent host (seconds).
// Requests with a timestamp outside this window are rejected.
const CLOCK_SKEW_S = 300; // 5 minutes

if (!SECRET) {
  process.stderr.write(
    "[unaxis-agent] FATAL: AGENT_SECRET env var is not set.\n" +
    "  The agent will refuse all requests until a secret is configured.\n" +
    "  Set it via:  docker run -e AGENT_SECRET=<secret> ...\n"
  );
}

// ── HMAC helpers ─────────────────────────────────────────────────────────────

/** Import AGENT_SECRET as a CryptoKey for HMAC-SHA-256 verification. */
async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/** Convert a hex string to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Returns null if the request carries a valid HMAC signature, or a Response
 * with the appropriate error status if not.
 *
 * Call at the top of every route handler:
 *   const denied = await checkAuth(req);
 *   if (denied) return denied;
 */
export async function checkAuth(req: Request): Promise<Response | null> {
  // ── 1. Agent not configured ───────────────────────────────────────────────
  if (!SECRET) {
    return new Response(
      JSON.stringify({ error: "Agent is not configured: AGENT_SECRET is not set" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 2. Extract headers ────────────────────────────────────────────────────
  const tsHeader  = req.headers.get("X-PortainerAgent-Timestamp") ?? "";
  const sigHeader = req.headers.get("X-PortainerAgent-Signature") ?? "";

  if (!tsHeader || !sigHeader) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized — X-PortainerAgent-Timestamp and X-PortainerAgent-Signature are required",
      }),
      {
        status: 401,
        headers: {
          "Content-Type":     "application/json",
          "WWW-Authenticate": 'HMAC realm="unaxis-agent"',
        },
      },
    );
  }

  // ── 3. Timestamp freshness check (replay protection) ─────────────────────
  const tsSeconds = parseInt(tsHeader, 10);
  if (isNaN(tsSeconds)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — invalid X-PortainerAgent-Timestamp" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > CLOCK_SKEW_S) {
    return new Response(
      JSON.stringify({
        error:   "Unauthorized — request timestamp is too old or too far in the future",
        skew:    nowSeconds - tsSeconds,
        windowS: CLOCK_SKEW_S,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 4. HMAC verification ──────────────────────────────────────────────────
  try {
    const key      = await importKey(SECRET);
    const data     = new TextEncoder().encode(tsHeader);
    const sigBytes = hexToBytes(sigHeader);

    const valid = sigBytes.length > 0 &&
      await crypto.subtle.verify("HMAC", key, sigBytes, data);

    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — signature mismatch" }),
        {
          status: 401,
          headers: {
            "Content-Type":     "application/json",
            "WWW-Authenticate": 'HMAC realm="unaxis-agent"',
          },
        },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Unauthorized — signature verification failed" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  return null; // authorized
}
