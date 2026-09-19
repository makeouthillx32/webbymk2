// src/lib/spiffe/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// SPIFFE / WIMSE type definitions for agent identity.
//
// The core primitive is a JWT-SVID — a short-lived, cryptographically signed
// JWT whose `sub` claim is a `spiffe://` URI. This file defines the shapes
// that flow through the issuance, verification, and token exchange pipelines.
//
// Standards:
//   SPIFFE JWT-SVID spec     https://github.com/spiffe/spiffe/blob/main/standards/JWT-SVID.md
//   WIMSE WIT (IETF draft)   draft-ietf-wimse-workload-creds
//   RFC 8693 Token Exchange
//   RFC 7517 / 7518 JWKS / JWA
// ─────────────────────────────────────────────────────────────────────────────

// ── SPIFFE ID ─────────────────────────────────────────────────────────────────

/**
 * A parsed SPIFFE ID.
 * Raw form: `spiffe://trust-domain/path`
 * e.g.    : `spiffe://unenter.live/agents/claude`
 */
export interface SpiffeId {
  /** The full URI, e.g. `spiffe://unenter.live/agents/claude` */
  uri: string;
  /** The trust domain component, e.g. `unenter.live` */
  trustDomain: string;
  /** The path component (without leading slash), e.g. `agents/claude` */
  path: string;
}

/** Parse a raw spiffe:// URI string. Throws on malformed input. */
export function parseSpiffeId(uri: string): SpiffeId {
  if (!uri.startsWith("spiffe://")) {
    throw new Error(`Invalid SPIFFE ID: must start with spiffe:// — got: ${uri}`);
  }
  const withoutScheme = uri.slice("spiffe://".length);
  const slashIdx = withoutScheme.indexOf("/");
  if (slashIdx === -1 || slashIdx === 0) {
    throw new Error(`Invalid SPIFFE ID: missing path component — got: ${uri}`);
  }
  const trustDomain = withoutScheme.slice(0, slashIdx);
  const path = withoutScheme.slice(slashIdx + 1);
  if (!trustDomain || !path) {
    throw new Error(`Invalid SPIFFE ID: empty trust domain or path — got: ${uri}`);
  }
  return { uri, trustDomain, path };
}

/** Build a SPIFFE ID URI from parts. */
export function buildSpiffeId(trustDomain: string, path: string): string {
  return `spiffe://${trustDomain}/${path.replace(/^\//, "")}`;
}

// ── JWT-SVID claims ───────────────────────────────────────────────────────────

/**
 * The standard JWT claims present in a SPIFFE JWT-SVID.
 * The `sub` claim MUST be a `spiffe://` URI.
 */
export interface JwtSvidClaims {
  /** SPIFFE ID — `spiffe://trust-domain/path` */
  sub: string;
  /** Issuer — typically the trust domain URI */
  iss: string;
  /** Audience — list of intended recipients */
  aud: string[];
  /** Issued-at (epoch seconds) */
  iat: number;
  /** Expiry (epoch seconds) */
  exp: number;
  /** JWT ID — random nonce to prevent replay within window */
  jti: string;
  /** Agent display name (custom claim) */
  agent_name?: string;
}

/** A fully verified JWT-SVID including the parsed SPIFFE ID. */
export interface VerifiedJwtSvid {
  claims: JwtSvidClaims;
  spiffeId: SpiffeId;
  /** Raw JWT string */
  raw: string;
}

// ── Agent registry ────────────────────────────────────────────────────────────

/** A row from the `agent_identities` table. */
export interface AgentRegistration {
  id: string;
  spiffeId: string;
  displayName: string;
  description: string | null;
  publicKeyJwk: JsonWebKey;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

// ── Token endpoint request / response ────────────────────────────────────────

/**
 * Mode 1: Agent authenticates as itself.
 * Mirrors OAuth 2.0 client_credentials with JWT client assertion (RFC 7523).
 */
export interface SelfAuthRequest {
  grant_type: "client_credentials";
  /** Must be `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` */
  client_assertion_type: string;
  /** A signed JWT-SVID produced by the agent */
  client_assertion: string;
  scope?: string;
}

/**
 * Mode 2: Agent acts on behalf of a user.
 * RFC 8693 Token Exchange — agent presents both its SVID and the user apos;s token.
 */
export interface DelegatedAuthRequest {
  grant_type: "urn:ietf:params:oauth:grant-type:token-exchange";
  /** The user apos;s existing access token (Supabase JWT) */
  subject_token: string;
  subject_token_type: "urn:ietf:params:oauth:token-type:access_token";
  /** The agent apos;s signed JWT-SVID (acts as the actor) */
  actor_token: string;
  actor_token_type: "urn:ietf:params:oauth:token-type:jwt";
  /** The service this delegated token is intended for */
  audience?: string;
}

export type AgentTokenRequest = SelfAuthRequest | DelegatedAuthRequest;

/**
 * The token response returned by `/api/auth/agent/token`.
 * Always a short-lived JWT.
 */
export interface AgentTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
  /** The SPIFFE ID that was authenticated */
  spiffe_id: string;
  /** For delegated tokens: the user ID the agent is acting on behalf of */
  delegation_subject?: string;
}

// ── Agent Access Token (AAT) claims ──────────────────────────────────────────

/**
 * Claims in the Agent Access Token issued by our token endpoint.
 *
 * For self-auth: sub = spiffe_id
 * For delegation: sub = user_id, act.sub = spiffe_id  (RFC 8693 section 4.1)
 */
export interface AatClaims {
  /** For self-auth: SPIFFE URI. For delegation: Supabase user UUID */
  sub: string;
  iss: string;
  aud: string[];
  iat: number;
  exp: number;
  jti: string;
  /** SPIFFE ID of the acting agent */
  spiffe_id: string;
  /** RFC 8693 actor claim — present on delegated tokens */
  act?: { sub: string };
  /** Supabase user UUID — present on delegated tokens (mirrors sub) */
  user_id?: string;
  scope?: string;
}

// ── Token mode discriminator ──────────────────────────────────────────────────

export type AgentAuthMode = "self" | "delegated";

// ── Error shapes ──────────────────────────────────────────────────────────────

export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
}
