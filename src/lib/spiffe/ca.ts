// src/lib/spiffe/ca.ts
// ─────────────────────────────────────────────────────────────────────────────
// Self-Managed SPIFFE Certificate Authority.
//
// Responsibilities:
//   1. On first startup, generate an RSA-2048 signing key and log it as
//      SPIFFE_CA_PRIVATE_KEY_JWK (operator persists it to .env).
//   2. Issue JWT-SVIDs signed with that key.
//   3. Expose the public JWKS for external verifiers.
//
// The key never leaves the server. SVIDs are short-lived (default 15 min).
// Rotate the CA key by replacing the env var — all previously issued SVIDs
// will fail verification immediately (no revocation list needed for short TTLs).
//
// This is designed for the self-hosted Docker Compose model. For a production
// SPIRE-backed deployment, replace issueJwtSvid() with a SPIRE Workload API
// call and leave verify.ts unchanged (it uses the JWKS endpoint either way).
// ─────────────────────────────────────────────────────────────────────────────

import { parseSpiffeId, buildSpiffeId } from "./types";
import type { JwtSvidClaims } from "./types";

// ── Configuration ─────────────────────────────────────────────────────────────

export const TRUST_DOMAIN =
  process.env.SPIFFE_TRUST_DOMAIN?.trim() || "unenter.live";

export const DEFAULT_SVID_TTL =
  parseInt(process.env.SPIFFE_TOKEN_TTL_SECONDS || "900", 10);

/** The issuer claim embedded in every JWT-SVID. */
export const SPIFFE_ISSUER = `https://${TRUST_DOMAIN}`;

// ── CA key management ─────────────────────────────────────────────────────────

/** Module-level cache — key is loaded once per process. */
let _caKeyPair: CryptoKeyPair | null = null;
let _caPublicKeyJwk: JsonWebKey | null = null;

/**
 * Load the CA key pair from SPIFFE_CA_PRIVATE_KEY_JWK env var.
 * If the env var is absent (first run), generates a new key and logs it —
 * the operator must then persist it to avoid invalidating all existing SVIDs
 * on the next restart.
 */
async function loadOrGenerateCaKeyPair(): Promise<CryptoKeyPair> {
  const raw = process.env.SPIFFE_CA_PRIVATE_KEY_JWK?.trim();

  if (raw) {
    const jwk = JSON.parse(
      raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8"),
    ) as JsonWebKey;

    const privateKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    // Derive the public key from the private JWK
    const publicJwk: JsonWebKey = { ...jwk };
    delete publicJwk.d;
    delete publicJwk.p;
    delete publicJwk.q;
    delete publicJwk.dp;
    delete publicJwk.dq;
    delete publicJwk.qi;
    publicJwk.key_ops = ["verify"];

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      true,
      ["verify"],
    );
    _caPublicKeyJwk = publicJwk;
    return { privateKey, publicKey };
  }

  // First run — generate and warn loudly.
  console.warn(
    "[spiffe/ca] ⚠️  SPIFFE_CA_PRIVATE_KEY_JWK is not set. " +
      "Generating an ephemeral CA key — SVIDs will be invalidated on restart. " +
      "Persist the key printed below to your .env immediately.",
  );

  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );

  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  const encoded = Buffer.from(JSON.stringify(privateJwk)).toString("base64");
  console.warn(`[spiffe/ca] 🔑 Generated SPIFFE CA key. Add to .env:\nSPIFFE_CA_PRIVATE_KEY_JWK=${encoded}`);

  _caPublicKeyJwk = publicJwk;
  return keyPair;
}

export async function getCaKeyPair(): Promise<CryptoKeyPair> {
  if (!_caKeyPair) {
    _caKeyPair = await loadOrGenerateCaKeyPair();
  }
  return _caKeyPair;
}

// ── JWT utilities ─────────────────────────────────────────────────────────────

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

/** Generate a random JWT ID (jti) to prevent replay within TTL window. */
function generateJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

// ── JWT-SVID issuance ─────────────────────────────────────────────────────────

/**
 * Issue a signed JWT-SVID for the given SPIFFE ID.
 *
 * @param spiffeIdUri  Full spiffe:// URI, e.g. `spiffe://unenter.live/agents/claude`
 * @param audience     Intended recipients (at least one required per SPIFFE spec)
 * @param ttlSeconds   Token lifetime in seconds (default: SPIFFE_TOKEN_TTL_SECONDS)
 * @param agentName    Optional display name embedded as `agent_name` claim
 */
export async function issueJwtSvid(
  spiffeIdUri: string,
  audience: string[],
  ttlSeconds = DEFAULT_SVID_TTL,
  agentName?: string,
): Promise<string> {
  // Validate the SPIFFE ID
  const parsed = parseSpiffeId(spiffeIdUri);
  if (parsed.trustDomain !== TRUST_DOMAIN) {
    throw new Error(
      `SPIFFE ID trust domain mismatch: expected ${TRUST_DOMAIN}, got ${parsed.trustDomain}`,
    );
  }
  if (audience.length === 0) {
    throw new Error("JWT-SVID must have at least one audience (SPIFFE spec §5)");
  }

  const keyPair = await getCaKeyPair();
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claims: JwtSvidClaims = {
    sub: spiffeIdUri,
    iss: SPIFFE_ISSUER,
    aud: audience,
    iat: now,
    exp: now + ttlSeconds,
    jti: generateJti(),
    ...(agentName ? { agent_name: agentName } : {}),
  };

  const headerB64 = base64url(JSON.stringify(header));
  const claimsB64 = base64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${claimsB64}`;

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(signature)}`;
}

// ── JWKS endpoint ─────────────────────────────────────────────────────────────

/** Stable key ID derived from the trust domain (good enough for single-key CA). */
const KEY_ID = `${TRUST_DOMAIN}-ca-v1`;

/**
 * Returns the JWKS (JSON Web Key Set) for this trust domain.
 * Callers serve this at `/.well-known/spiffe/jwks.json` and
 * `/api/auth/agent/jwks`.
 */
export async function getJwks(): Promise<{ keys: JsonWebKey[] }> {
  await getCaKeyPair(); // ensures _caPublicKeyJwk is populated
  const pub = _caPublicKeyJwk!;
  return {
    keys: [
      {
        kty: pub.kty,
        n: pub.n,
        e: pub.e,
        alg: "RS256",
        use: "sig",
        kid: KEY_ID,
      },
    ],
  };
}

/**
 * Returns the raw public CryptoKey for in-process verification (avoids HTTP).
 */
export async function getCaPublicKey(): Promise<CryptoKey> {
  const pair = await getCaKeyPair();
  return pair.publicKey;
}

// ── Convenience — build a SPIFFE ID for a well-known agent ───────────────────

/**
 * Build the canonical SPIFFE ID for a named agent on this trust domain.
 * e.g. agentSpiffeId("claude") → "spiffe://unenter.live/agents/claude"
 */
export function agentSpiffeId(agentSlug: string): string {
  return buildSpiffeId(TRUST_DOMAIN, `agents/${agentSlug}`);
}
