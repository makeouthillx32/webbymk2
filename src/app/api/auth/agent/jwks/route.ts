// src/app/api/auth/agent/jwks/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// JWKS Endpoint — publishes the trust domain apos;s public key set.
//
// Served at: /api/auth/agent/jwks
// Also aliased via next.config.js to: /.well-known/spiffe/jwks.json
//
// This endpoint allows external services to verify JWT-SVIDs and Agent Access
// Tokens issued by this platform apos;s self-managed CA, without needing to call
// the token endpoint.
//
// The response is cached for 5 minutes (public, immutable per key ID).
// CA key rotation invalidates all outstanding tokens — no grace period needed
// for short-lived SVIDs (15 min TTL).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getJwks, TRUST_DOMAIN, SPIFFE_ISSUER } from "@/lib/spiffe/ca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const jwks = await getJwks();

    return NextResponse.json(
      {
        ...jwks,
        // SPIFFE bundle metadata — non-standard but useful for debugging
        trust_domain: TRUST_DOMAIN,
        issuer:       SPIFFE_ISSUER,
      },
      {
        headers: {
          // Cache publicly for 5 minutes; keys change rarely
          "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
          // CORS — allow any service to fetch our public keys
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[agent/jwks] Failed to produce JWKS:", err);
    return NextResponse.json(
      { error: "server_error", error_description: "Could not load CA public keys" },
      { status: 500 },
    );
  }
}
