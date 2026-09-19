// src/lib/spiffe/agentClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client utilities for agents to:
//   1. Build a JWT client assertion (signed with their own private key)
//   2. Call /api/auth/agent/token for self-auth or delegated auth
//   3. Decode the returned Agent Access Token
//
// Compatible with Node.js (UNAXIS TUI), Edge Runtime (Next.js API routes),
// and Bun. Uses only Web Crypto API and native fetch.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentTokenResponse, AatClaims } from "./types";

// ── Base64url helpers ─────────────────────────────────────────────────────────

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

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return Uint8Array.from(atob(padded + "=".repeat(pad)), (c) => c.charCodeAt(0));
}

function generateJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

// ── Key loading ───────────────────────────────────────────────────────────────

/**
 * Load a private RSA key from a JWK (as JSON string, base64, or object).
 * Used by the agent to load its own signing key from an env var.
 */
export async function loadPrivateKey(
  jwkInput: string | JsonWebKey,
): Promise<CryptoKey> {
  let jwk: JsonWebKey;
  if (typeof jwkInput === "string") {
    const raw = jwkInput.trim();
    jwk = JSON.parse(
      raw.startsWith("{") ? raw : new TextDecoder().decode(base64urlDecode(raw)),
    ) as JsonWebKey;
  } else {
    jwk = jwkInput;
  }
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// ── Client assertion builder ──────────────────────────────────────────────────

export interface ClientAssertionOptions {
  /** The agent apos;s SPIFFE ID URI, e.g. `spiffe://unenter.live/agents/claude` */
  spiffeId: string;
  /** The private signing key */
  privateKey: CryptoKey;
  /** Audience — typically the token endpoint URL */
  audience: string;
  /** Issuer claim — defaults to spiffeId */
  issuer?: string;
  /** Lifetime in seconds (default: 60 — short-lived assertion) */
  ttlSeconds?: number;
}

/**
 * Build a signed JWT client assertion.
 * This is presented as `client_assertion` in the token request.
 * Conforms to RFC 7523 §2.2.
 */
export async function buildClientAssertion(opts: ClientAssertionOptions): Promise<string> {
  const { spiffeId, privateKey, audience, ttlSeconds = 60 } = opts;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: opts.issuer ?? `https://${spiffeId.slice("spiffe://".length).split("/", 1)[0]}`,
    sub: spiffeId,
    aud: audience,
    iat: now,
    exp: now + ttlSeconds,
    jti: generateJti(),
  };

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

// ── Token requests ────────────────────────────────────────────────────────────

export interface SelfAuthOptions {
  /** The agent apos;s SPIFFE ID */
  spiffeId: string;
  /** The agent apos;s private key */
  privateKey: CryptoKey;
  /** Base URL of the auth zone, e.g. `https://unenter.live` */
  baseUrl: string;
  scope?: string;
}

/**
 * Perform OAuth 2.0 client_credentials flow using a JWT-SVID client assertion.
 * Returns an Agent Access Token for the agent apos;s own identity.
 */
export async function requestSelfAuthToken(
  opts: SelfAuthOptions,
): Promise<AgentTokenResponse> {
  const tokenEndpoint = `${opts.baseUrl.replace(/\/$/, "")}/api/auth/agent/token`;

  const clientAssertion = await buildClientAssertion({
    spiffeId: opts.spiffeId,
    privateKey: opts.privateKey,
    audience: tokenEndpoint,
  });

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    ...(opts.scope ? { scope: opts.scope } : {}),
  });

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(
      `Agent token request failed (${res.status}): ${(err as { error?: string }).error ?? "unknown"}`,
    );
  }

  return res.json() as Promise<AgentTokenResponse>;
}

export interface TokenExchangeOptions {
  /** The user apos;s existing Supabase access token */
  userAccessToken: string;
  /** The agent apos;s SPIFFE ID */
  spiffeId: string;
  /** The agent apos;s private key (used to build the actor JWT-SVID) */
  privateKey: CryptoKey;
  /** Base URL of the auth zone */
  baseUrl: string;
  /** The downstream service this token is intended for */
  audience?: string;
}

/**
 * Perform RFC 8693 Token Exchange.
 * The agent acts on behalf of the user. The returned token carries:
 *   sub = user_id,  act.sub = spiffe_id
 */
export async function exchangeForDelegatedToken(
  opts: TokenExchangeOptions,
): Promise<AgentTokenResponse> {
  const tokenEndpoint = `${opts.baseUrl.replace(/\/$/, "")}/api/auth/agent/token`;

  // Build a short-lived JWT-SVID to use as the actor token
  const actorToken = await buildClientAssertion({
    spiffeId: opts.spiffeId,
    privateKey: opts.privateKey,
    audience: tokenEndpoint,
    ttlSeconds: 60,
  });

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: opts.userAccessToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    actor_token: actorToken,
    actor_token_type: "urn:ietf:params:oauth:token-type:jwt",
    ...(opts.audience ? { audience: opts.audience } : {}),
  });

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "unknown" }));
    throw new Error(
      `Token exchange failed (${res.status}): ${(err as { error?: string }).error ?? "unknown"}`,
    );
  }

  return res.json() as Promise<AgentTokenResponse>;
}

// ── AAT decoding ──────────────────────────────────────────────────────────────

/**
 * Decode (but do NOT verify) an Agent Access Token.
 * Useful for logging and display — never use for authorization decisions.
 */
export function decodeAat(token: string): AatClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = new TextDecoder().decode(base64urlDecode(parts[1]));
    return JSON.parse(payload) as AatClaims;
  } catch {
    return null;
  }
}

// ── Key generation helper ─────────────────────────────────────────────────────

/**
 * Generate a new RSA-2048 key pair for an agent.
 * Returns the private key JWK (to store in env) and the public key JWK
 * (to register in the agent_identities table via /api/auth/agent/register).
 *
 * This is a one-time operation per agent. Run it in a setup script.
 */
export async function generateAgentKeyPair(): Promise<{
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  privateKeyB64: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );

  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyB64 = Buffer.from(JSON.stringify(privateKeyJwk)).toString("base64");

  return { privateKeyJwk, publicKeyJwk, privateKeyB64 };
}
