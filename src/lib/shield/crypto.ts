// src/lib/shield/crypto.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cryptographic challenge generation, Proof-of-Work validation, and signed
// clearance cookie issuance for Unenter Edge Shield.
//
// Rewritten 2026-09-04 from node:crypto (createHmac/createHash/randomBytes)
// to Web Crypto (globalThis.crypto.subtle) after `unaxis zone tank build`
// failed outright: Next.js bundles middleware.ts for the Edge Runtime by
// default, and webpack refuses to bundle a `node:crypto` import for that
// target at all — "UnhandledSchemeError ... not handled by plugins". An
// earlier verification pass on this file only ran it through a plain Bun
// process (`bun -e "import { middleware } ..."`), which has no such
// restriction and never surfaced the incompatibility; the real Next.js
// build is what actually catches it. Web Crypto's subtle API is entirely
// promise-based, so every function here that touches an HMAC or hash is now
// async — every caller (middleware.ts) must await it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ShieldChallenge,
  ClearancePayload,
  DEFAULT_DIFFICULTY,
  CHALLENGE_EXPIRY_MS,
} from "./types";
import { getShieldPolicyForHost } from "./policy";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomBytesHex(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(signature));
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(digest));
}

function getShieldSecret(): string {
  return (
    process.env["SHIELD_SECRET"] ||
    process.env["JWT_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "unt_shield_super_secure_fallback_key_2026_unenter_live"
  );
}

export function generateRayId(): string {
  return `unt_${randomBytesHex(8)}`;
}

export function getClientSubnet(ip: string): string {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return "localhost";
  // IPv4 /24 subnet grouping
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }
  // IPv6 /64 prefix
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 4).join(":")}::/64`;
  }
  return ip;
}

export async function createShieldChallenge(
  domain: string,
  clientIp: string,
  difficulty: number = DEFAULT_DIFFICULTY
): Promise<{ challenge: ShieldChallenge; serialized: string }> {
  const timestamp = Date.now();
  const nonce = randomBytesHex(8);
  const rayId = generateRayId();

  const challengeData = `${domain}|${clientIp}|${timestamp}|${nonce}|${difficulty}|${rayId}`;
  const signature = await hmacSha256Hex(getShieldSecret(), challengeData);

  const challenge: ShieldChallenge = {
    domain,
    clientIp,
    timestamp,
    nonce,
    difficulty,
    rayId,
    signature,
  };

  const serialized = Buffer.from(JSON.stringify(challenge)).toString("base64url");
  return { challenge, serialized };
}

export async function verifyProofOfWork(
  serializedChallenge: string,
  solution: number | string
): Promise<{ success: boolean; error?: string; challenge?: ShieldChallenge }> {
  try {
    const raw = Buffer.from(serializedChallenge, "base64url").toString("utf-8");
    const challenge: ShieldChallenge = JSON.parse(raw);

    // 1. Verify Timestamp Freshness
    const age = Date.now() - challenge.timestamp;
    if (age < 0 || age > CHALLENGE_EXPIRY_MS) {
      return { success: false, error: "Challenge expired. Please try again." };
    }

    // 2. Verify Challenge Signature
    const challengeData = `${challenge.domain}|${challenge.clientIp}|${challenge.timestamp}|${challenge.nonce}|${challenge.difficulty}|${challenge.rayId}`;
    const expectedSig = await hmacSha256Hex(getShieldSecret(), challengeData);

    if (challenge.signature !== expectedSig) {
      return { success: false, error: "Invalid challenge signature." };
    }

    // 3. Verify Proof-of-Work Solution
    const input = `${challengeData}:${solution}`;
    const hash = await sha256Hex(input);
    const targetPrefix = "0".repeat(challenge.difficulty);

    if (!hash.startsWith(targetPrefix)) {
      return { success: false, error: "Invalid proof-of-work computation." };
    }

    return { success: true, challenge };
  } catch {
    return { success: false, error: "Malformed challenge token." };
  }
}

export async function signClearanceToken(domain: string, clientIp: string, rayId: string): Promise<string> {
  const now = Date.now();
  // TTL is per-zone: a research zone (labs) expires clearance far sooner than
  // a livestream zone. Derived from `domain` so the token carries its own
  // lifetime — verifyClearanceToken only ever reads expiresAt, so shortening a
  // zone's TTL takes effect for NEW clearances without invalidating the token
  // format or needing a coordinated deploy.
  const { clearanceTtlSeconds } = getShieldPolicyForHost(domain);
  const payload: ClearancePayload = {
    version: 1,
    domain,
    clientIpSubnet: getClientSubnet(clientIp),
    rayId,
    issuedAt: now,
    expiresAt: now + clearanceTtlSeconds * 1000,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = await hmacSha256Hex(getShieldSecret(), encodedPayload);

  return `v1.${encodedPayload}.${signature}`;
}

export async function verifyClearanceToken(
  token: string,
  domain: string,
  clientIp: string
): Promise<{ valid: boolean; payload?: ClearancePayload }> {
  if (!token || !token.startsWith("v1.")) return { valid: false };

  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false };

  const [version, encodedPayload, signature] = parts;
  if (version !== "v1") return { valid: false };

  const expectedSig = await hmacSha256Hex(getShieldSecret(), encodedPayload);

  if (signature !== expectedSig) return { valid: false };

  try {
    const raw = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    const payload: ClearancePayload = JSON.parse(raw);

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return { valid: false };
    }

    // Check domain matching (or wildcard parent domain)
    if (payload.domain !== domain && !domain.endsWith(`.${payload.domain}`)) {
      return { valid: false };
    }

    // Check client subnet match (protects against cookie theft/replay across distinct IPs)
    const currentSubnet = getClientSubnet(clientIp);
    if (payload.clientIpSubnet !== currentSubnet && payload.clientIpSubnet !== "localhost") {
      return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}
