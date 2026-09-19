// src/lib/spiffe/verify.ts
// ─────────────────────────────────────────────────────────────────────────────
// JWT-SVID verification.
//
// Verification steps (per SPIFFE JWT-SVID spec section 4):
//   1. Decode the JWT header — extract alg (must be RS256)
//   2. Fetch the JWKS from the trust domain (in-process shortcut for local CA)
//   3. Verify the signature
//   4. Validate standard claims: exp, iat, iss, aud, sub (must be spiffe://)
//   5. Validate the SPIFFE ID structure and trust domain
//
// The verifier never fetches remote JWKS in production — it uses the in-process
// CA public key, which is cheaper and avoids the bootstrapping problem. A JWKS
// URL fallback is provided for cross-service verification scenarios.
// ─────────────────────────────────────────────────────────────────────────────

import { getCaPublicKey, SPIFFE_ISSUER, TRUST_DOMAIN } from "./ca";
import { parseSpiffeId } from "./types";
import type { JwtSvidClaims, VerifiedJwtSvid } from "./types";

// ── JWT decoding utilities ────────────────────────────────────────────────────

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(pad);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(part))) as T;
}

// ── Verification errors ───────────────────────────────────────────────────────

export class SpiffeVerifyError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_FORMAT"
      | "INVALID_HEADER"
      | "INVALID_SIGNATURE"
      | "EXPIRED"
      | "NOT_YET_VALID"
      | "INVALID_ISSUER"
      | "INVALID_AUDIENCE"
      | "INVALID_SUBJECT"
      | "INVALID_TRUST_DOMAIN"
      | "MISSING_JTI",
  ) {
    super(message);
    this.name = "SpiffeVerifyError";
  }
}

// ── Core verifier ─────────────────────────────────────────────────────────────

export interface VerifyOptions {
  /**
   * Expected audience(s). At least one must match the token apos;s `aud` claim.
   * If omitted, any audience is accepted (use only in internal tooling).
   */
  audience?: string | string[];
  /**
   * Clock skew tolerance in seconds (default: 30).
   * Applied to both `exp` and `iat` checks.
   */
  clockSkewSeconds?: number;
  /**
   * Override the public key used for verification.
   * Defaults to the local CA public key (in-process, no HTTP).
   */
  publicKey?: CryptoKey;
}

/**
 * Verify a JWT-SVID and return the parsed identity on success.
 * Throws SpiffeVerifyError on any failure.
 */
export async function verifyJwtSvid(
  token: string,
  options: VerifyOptions = {},
): Promise<VerifiedJwtSvid> {
  const { clockSkewSeconds = 30 } = options;

  // 1. Split and decode
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SpiffeVerifyError("JWT must have exactly 3 parts", "INVALID_FORMAT");
  }
  const [headerB64, claimsB64, signatureB64] = parts;

  const header = decodeJwtPart<{ alg?: string; typ?: string }>(headerB64);
  if (header.alg !== "RS256") {
    throw new SpiffeVerifyError(
      `Unsupported algorithm: ${header.alg} (expected RS256)`,
      "INVALID_HEADER",
    );
  }

  const claims = decodeJwtPart<Partial<JwtSvidClaims>>(claimsB64);

  // 2. Signature verification
  const publicKey = options.publicKey ?? (await getCaPublicKey());
  const signingInput = new TextEncoder().encode(`${headerB64}.${claimsB64}`);
  const signature = base64urlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signature,
    signingInput,
  );
  if (!valid) {
    throw new SpiffeVerifyError("Signature verification failed", "INVALID_SIGNATURE");
  }

  // 3. Time-based claims
  const now = Math.floor(Date.now() / 1000);

  if (typeof claims.exp !== "number") {
    throw new SpiffeVerifyError("Missing exp claim", "INVALID_FORMAT");
  }
  if (now > claims.exp + clockSkewSeconds) {
    throw new SpiffeVerifyError(
      `Token expired at ${new Date(claims.exp * 1000).toISOString()}`,
      "EXPIRED",
    );
  }

  if (typeof claims.iat === "number" && claims.iat - clockSkewSeconds > now) {
    throw new SpiffeVerifyError("Token not yet valid (iat is in the future)", "NOT_YET_VALID");
  }

  // 4. Issuer
  if (claims.iss !== SPIFFE_ISSUER) {
    throw new SpiffeVerifyError(
      `Invalid issuer: expected ${SPIFFE_ISSUER}, got ${claims.iss}`,
      "INVALID_ISSUER",
    );
  }

  // 5. Audience
  if (options.audience !== undefined) {
    const expected = Array.isArray(options.audience) ? options.audience : [options.audience];
    const tokenAud = Array.isArray(claims.aud) ? claims.aud : (claims.aud ? [claims.aud] : []);
    const match = expected.some((a) => tokenAud.includes(a));
    if (!match) {
      throw new SpiffeVerifyError(
        `Audience mismatch: token has [${tokenAud.join(", ")}], expected one of [${expected.join(", ")}]`,
        "INVALID_AUDIENCE",
      );
    }
  }

  // 6. Subject — must be a spiffe:// URI
  if (!claims.sub?.startsWith("spiffe://")) {
    throw new SpiffeVerifyError(
      `Invalid sub claim: must be a spiffe:// URI, got: ${claims.sub}`,
      "INVALID_SUBJECT",
    );
  }

  // 7. Parse and trust-domain-check the SPIFFE ID
  const spiffeId = parseSpiffeId(claims.sub);
  if (spiffeId.trustDomain !== TRUST_DOMAIN) {
    throw new SpiffeVerifyError(
      `Trust domain mismatch: expected ${TRUST_DOMAIN}, got ${spiffeId.trustDomain}`,
      "INVALID_TRUST_DOMAIN",
    );
  }

  // 8. JTI — must be present (required for replay-detection hooks)
  if (!claims.jti) {
    throw new SpiffeVerifyError("Missing jti claim", "MISSING_JTI");
  }

  return {
    claims: claims as JwtSvidClaims,
    spiffeId,
    raw: token,
  };
}

// ── Convenience wrapper ───────────────────────────────────────────────────────

/**
 * Same as verifyJwtSvid but returns null instead of throwing.
 * Useful for middleware and logging paths that handle failures gracefully.
 */
export async function tryVerifyJwtSvid(
  token: string,
  options?: VerifyOptions,
): Promise<VerifiedJwtSvid | null> {
  try {
    return await verifyJwtSvid(token, options);
  } catch {
    return null;
  }
}
