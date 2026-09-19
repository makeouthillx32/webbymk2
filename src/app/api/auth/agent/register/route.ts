// src/app/api/auth/agent/register/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Agent Registration Endpoint (admin-only)
//
// POST /api/auth/agent/register
//   Authentication: Supabase cookie session for an administrator
//   Content-Type: application/json
//   { "spiffe_id": "spiffe://unenter.live/agents/my-agent", "display_name": "My Agent", "description": "...", "public_key_jwk": { ... } }
//
// GET /api/auth/agent/register
//   Lists all registered agents (admin only).
//
// DELETE /api/auth/agent/register
//   Content-Type: application/json
//   { "spiffe_id": "spiffe://unenter.live/agents/my-agent" }
//   Revokes (soft-deletes) an agent.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { registerAgent, revokeAgent, listAllAgents } from "@/lib/spiffe/registry";
import { parseSpiffeId } from "@/lib/spiffe/types";
import { TRUST_DOMAIN } from "@/lib/spiffe/ca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Auth guard — admin only ───────────────────────────────────────────────────

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
    }

    return { userId: user.id };
  } catch {
    return NextResponse.json({ error: "Authentication check failed" }, { status: 500 });
  }
}

// ── POST — Register agent ─────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  let body: { spiffe_id?: string; display_name?: string; description?: string; public_key_jwk?: JsonWebKey };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { spiffe_id, display_name, description, public_key_jwk } = body;

  if (!spiffe_id || !display_name || !public_key_jwk) {
    return NextResponse.json(
      { error: "spiffe_id, display_name, and public_key_jwk are required" },
      { status: 400 },
    );
  }

  if (
    public_key_jwk.kty !== "RSA" ||
    !public_key_jwk.n ||
    !public_key_jwk.e ||
    "d" in public_key_jwk
  ) {
    return NextResponse.json(
      { error: "public_key_jwk must be an RSA public JWK and must not contain private key material" },
      { status: 400 },
    );
  }

  // Validate SPIFFE ID format and trust domain
  let parsed;
  try {
    parsed = parseSpiffeId(spiffe_id);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid SPIFFE ID: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  if (parsed.trustDomain !== TRUST_DOMAIN) {
    return NextResponse.json(
      { error: `SPIFFE ID must be in trust domain ${TRUST_DOMAIN}` },
      { status: 400 },
    );
  }

  try {
    const registration = await registerAgent({
      spiffeId: spiffe_id,
      displayName: display_name,
      description,
      publicKeyJwk: public_key_jwk,
      createdBy: authResult.userId,
    });

    return NextResponse.json({ agent: registration }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json(
        { error: `SPIFFE ID already registered: ${spiffe_id}` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET — List agents ─────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const agents = await listAllAgents();
    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list agents" },
      { status: 500 },
    );
  }
}

// ── DELETE — Revoke agent ─────────────────────────────────────────────────────

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  let body: { spiffe_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.spiffe_id) {
    return NextResponse.json({ error: "spiffe_id is required" }, { status: 400 });
  }

  try {
    await revokeAgent(body.spiffe_id);
    return NextResponse.json({ revoked: body.spiffe_id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Revocation failed" },
      { status: 500 },
    );
  }
}
