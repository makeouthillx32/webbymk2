// src/app/api/auth/agent/token/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Agent Token Endpoint
//
// Two modes (distinguished by grant_type):
//
//   Mode 1 — Self-Authentication (client_credentials + JWT client assertion)
//   ──────────────────────────────────────────────────────────────────────────
//   POST /api/auth/agent/token
//   Content-Type: application/x-www-form-urlencoded
//
//   grant_type=client_credentials
//   &client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
//   &client_assertion=<agent_signed_JWT-SVID>
//   &scope=agent:self        (optional)
//
//   Validates the JWT-SVID, checks the registry, issues a 15-min AAT.
//
//   Mode 2 — Delegated (RFC 8693 Token Exchange)
//   ──────────────────────────────────────────────────────────────────────────
//   POST /api/auth/agent/token
//   Content-Type: application/x-www-form-urlencoded
//
//   grant_type=urn:ietf:params:oauth:grant-type:token-exchange
//   &subject_token=<supabase_user_access_token>
//   &subject_token_type=urn:ietf:params:oauth:token-type:access_token
//   &actor_token=<agent_signed_JWT-SVID>
//   &actor_token_type=urn:ietf:params:oauth:token-type:jwt
//   &audience=unenter-api    (optional)
//
//   Validates both tokens; issues a delegated AAT with sub=user_id, act.sub=spiffe_id.
//
// Response (both modes):
//   { access_token, token_type: "Bearer", expires_in, spiffe_id, delegation_subject? }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { verifyJwtSvid, SpiffeVerifyError } from "@/lib/spiffe/verify";
import { issueJwtSvid, SPIFFE_ISSUER, TRUST_DOMAIN, DEFAULT_SVID_TTL } from "@/lib/spiffe/ca";
import { lookupAgent, touchAgentLastSeen } from "@/lib/spiffe/registry";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  AatClaims,
  AgentRegistration,
  OAuthErrorResponse,
  VerifiedJwtSvid,
} from "@/lib/spiffe/types";

export const runtime = "nodejs"; // Web Crypto + Supabase require Node
export const dynamic = "force-dynamic";

// ── Constants ─────────────────────────────────────────────────────────────────

const GRANT_CLIENT_CREDENTIALS = "client_credentials";
const GRANT_TOKEN_EXCHANGE      = "urn:ietf:params:oauth:grant-type:token-exchange";
const ASSERTION_TYPE_JWT        = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const TOKEN_TYPE_ACCESS         = "urn:ietf:params:oauth:token-type:access_token";
const TOKEN_TYPE_JWT            = "urn:ietf:params:oauth:token-type:jwt";

const AAT_AUDIENCE = [`https://${TRUST_DOMAIN}`];
const TOKEN_ENDPOINT_AUDIENCE =
  process.env.SPIFFE_TOKEN_ENDPOINT_AUDIENCE ??
  "https://auth.unenter.live/api/auth/agent/token";

// ── Error helpers ─────────────────────────────────────────────────────────────

function oauthError(
  error: string,
  description: string,
  status: 400 | 401 | 403 | 500 = 400,
): NextResponse<OAuthErrorResponse> {
  return NextResponse.json<OAuthErrorResponse>(
    { error, error_description: description },
    {
      status,
      headers: {
        "WWW-Authenticate": `Bearer realm="agent-token", error="${error}", error_description="${description}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

// ── JWT utility (minimal, for AAT issuance without crypto.subtle sign overhead) ──

function base64url(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

function assertionSubject(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
      ),
    ) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function verifyRegisteredAssertion(assertion: string, audience: string) {
  const claimedSubject = assertionSubject(assertion);
  if (!claimedSubject?.startsWith("spiffe://")) {
    throw new SpiffeVerifyError(
      "Assertion has no valid SPIFFE subject",
      "INVALID_SUBJECT",
    );
  }

  // The unverified subject is used only to select a candidate public key. The
  // identity is trusted only after its signature and claims verify.
  const registration = await lookupAgent(claimedSubject);
  if (!registration) return { svid: null, registration: null };

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    registration.publicKeyJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const svid = await verifyJwtSvid(assertion, { publicKey, audience });
  if (svid.spiffeId.uri !== registration.spiffeId) {
    throw new SpiffeVerifyError(
      "Assertion subject does not match registered key",
      "INVALID_SUBJECT",
    );
  }
  return { svid, registration };
}

/** Issue a signed Agent Access Token using the CA key. */
async function issueAat(claims: AatClaims, ttlSeconds: number): Promise<string> {
  // We reuse the CA apos;s private key to sign the AAT — same key pair, different claims shape.
  const { getCaKeyPair } = await import("@/lib/spiffe/ca");
  const { privateKey } = await getCaKeyPair();

  const header = { alg: "RS256", typ: "JWT" };
  const h = base64url(JSON.stringify(header));
  const c = base64url(JSON.stringify(claims));
  const sigInput = `${h}.${c}`;
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(sigInput),
  );
  return `${sigInput}.${base64url(sig)}`;
}

// ── GET client IP ─────────────────────────────────────────────────────────────

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// ── Audit log writer ──────────────────────────────────────────────────────────

async function writeAudit(opts: {
  agentId: string | null;
  spiffeId: string;
  action: "self_auth" | "delegation";
  subjectUser: string | null;
  audience: string;
  expiresAt: Date;
  ip: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("agent_token_audit").insert({
      agent_id:     opts.agentId,
      spiffe_id:    opts.spiffeId,
      action:       opts.action,
      subject_user: opts.subjectUser,
      audience:     opts.audience,
      expires_at:   opts.expiresAt.toISOString(),
      ip:           opts.ip,
    });
  } catch (err) {
    // Audit failures must never block token issuance
    console.error("[agent/token] Audit write failed:", err);
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);

  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text);
  } catch {
    return oauthError("invalid_request", "Request body must be application/x-www-form-urlencoded");
  }

  const grantType = formData.get("grant_type");

  // ── Mode 1: client_credentials ─────────────────────────────────────────────
  if (grantType === GRANT_CLIENT_CREDENTIALS) {
    const assertionType = formData.get("client_assertion_type");
    const assertion     = formData.get("client_assertion");

    if (assertionType !== ASSERTION_TYPE_JWT) {
      return oauthError(
        "invalid_request",
        `client_assertion_type must be ${ASSERTION_TYPE_JWT}`,
      );
    }
    if (!assertion) {
      return oauthError("invalid_request", "client_assertion is required");
    }

    // Verify the JWT-SVID
    let svid: VerifiedJwtSvid | null;
    let registration: AgentRegistration | null;
    try {
      ({ svid, registration } = await verifyRegisteredAssertion(assertion, TOKEN_ENDPOINT_AUDIENCE));
    } catch (err) {
      const code = err instanceof SpiffeVerifyError ? err.code : "UNKNOWN";
      return oauthError(
        "invalid_client",
        `SVID verification failed [${code}]: ${err instanceof Error ? err.message : "unknown"}`,
        401,
      );
    }

    // Check the registry
    if (!svid || !registration) {
      return oauthError(
        "unauthorized_client",
        "SPIFFE ID not registered or inactive",
        403,
      );
    }

    // Issue AAT
    const now        = Math.floor(Date.now() / 1000);
    const ttl        = DEFAULT_SVID_TTL;
    const expiresAt  = new Date((now + ttl) * 1000);
    const scope      = formData.get("scope") ?? "agent:self";

    const aatClaims: AatClaims = {
      sub:       svid.spiffeId.uri,
      iss:       SPIFFE_ISSUER,
      aud:       AAT_AUDIENCE,
      iat:       now,
      exp:       now + ttl,
      jti:       generateJti(),
      spiffe_id: svid.spiffeId.uri,
      scope,
    };

    const accessToken = await issueAat(aatClaims, ttl);

    // Fire-and-forget side effects
    void touchAgentLastSeen(svid.spiffeId.uri);
    void writeAudit({
      agentId:     registration.id,
      spiffeId:    svid.spiffeId.uri,
      action:      "self_auth",
      subjectUser: null,
      audience:    AAT_AUDIENCE[0],
      expiresAt,
      ip,
    });

    return NextResponse.json(
      {
        access_token: accessToken,
        token_type:   "Bearer",
        expires_in:   ttl,
        scope,
        spiffe_id:    svid.spiffeId.uri,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── Mode 2: RFC 8693 Token Exchange ───────────────────────────────────────
  if (grantType === GRANT_TOKEN_EXCHANGE) {
    const subjectToken     = formData.get("subject_token");
    const subjectTokenType = formData.get("subject_token_type");
    const actorToken       = formData.get("actor_token");
    const actorTokenType   = formData.get("actor_token_type");
    const audience         = formData.get("audience") ?? `https://${TRUST_DOMAIN}`;

    if (subjectTokenType !== TOKEN_TYPE_ACCESS) {
      return oauthError("invalid_request", `subject_token_type must be ${TOKEN_TYPE_ACCESS}`);
    }
    if (actorTokenType !== TOKEN_TYPE_JWT) {
      return oauthError("invalid_request", `actor_token_type must be ${TOKEN_TYPE_JWT}`);
    }
    if (!subjectToken) {
      return oauthError("invalid_request", "subject_token is required");
    }
    if (!actorToken) {
      return oauthError("invalid_request", "actor_token is required");
    }

    // Verify the actor (agent SVID)
    let svid: VerifiedJwtSvid | null;
    let registration: AgentRegistration | null;
    try {
      ({ svid, registration } = await verifyRegisteredAssertion(actorToken, TOKEN_ENDPOINT_AUDIENCE));
    } catch (err) {
      const code = err instanceof SpiffeVerifyError ? err.code : "UNKNOWN";
      return oauthError(
        "invalid_client",
        `Actor SVID verification failed [${code}]: ${err instanceof Error ? err.message : "unknown"}`,
        401,
      );
    }

    // Check the agent registry
    if (!svid || !registration) {
      return oauthError(
        "unauthorized_client",
        "SPIFFE ID not registered or inactive",
        403,
      );
    }

    // Verify the subject (user Supabase token)
    let userId: string;
    try {
      const supabase = await createClient();
      const { data: userData, error } = await supabase.auth.getUser(subjectToken);
      if (error || !userData.user?.id) {
        return oauthError(
          "invalid_grant",
          "subject_token is invalid or expired",
          401,
        );
      }
      userId = userData.user.id;
    } catch {
      return oauthError("server_error", "Failed to verify subject token", 500);
    }

    // Issue delegated AAT with RFC 8693 apos;act apos; claim
    const now       = Math.floor(Date.now() / 1000);
    const ttl       = DEFAULT_SVID_TTL;
    const expiresAt = new Date((now + ttl) * 1000);

    const aatClaims: AatClaims = {
      sub:       userId,
      iss:       SPIFFE_ISSUER,
      aud:       [audience],
      iat:       now,
      exp:       now + ttl,
      jti:       generateJti(),
      spiffe_id: svid.spiffeId.uri,
      act:       { sub: svid.spiffeId.uri },
      user_id:   userId,
      scope:     "delegation",
    };

    const accessToken = await issueAat(aatClaims, ttl);

    // Fire-and-forget side effects
    void touchAgentLastSeen(svid.spiffeId.uri);
    void writeAudit({
      agentId:     registration.id,
      spiffeId:    svid.spiffeId.uri,
      action:      "delegation",
      subjectUser: userId,
      audience,
      expiresAt,
      ip,
    });

    return NextResponse.json(
      {
        access_token:        accessToken,
        token_type:          "Bearer" as const,
        expires_in:          ttl,
        scope:               "delegation",
        spiffe_id:           svid.spiffeId.uri,
        delegation_subject:  userId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── Unsupported grant type ─────────────────────────────────────────────────
  return oauthError(
    "unsupported_grant_type",
    `Supported grant types: ${GRANT_CLIENT_CREDENTIALS}, ${GRANT_TOKEN_EXCHANGE}`,
  );
}
