// src/lib/shield/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Types and constants for the self-hosted Edge Shield Bot Verification Engine.
// ─────────────────────────────────────────────────────────────────────────────

export interface ShieldChallenge {
  domain: string;
  clientIp: string;
  timestamp: number;
  nonce: string;
  difficulty: number; // Number of leading zero hex chars required in hash
  rayId: string;
  signature: string;
}

export interface ShieldVerifyPayload {
  challengeStr: string;
  solution: number | string;
  rayId: string;
}

export interface ClearancePayload {
  version: 1;
  domain: string;
  clientIpSubnet: string; // e.g. "192.168.1.0/24" or IPv6 prefix to allow minor IP drift
  rayId: string;
  issuedAt: number;
  expiresAt: number;
}

export type ShieldMode = "off" | "suspicious" | "under_attack";

export const SHIELD_COOKIE_NAME = "__unt_clearance";
// Restored to 4 (~65,536 average attempts) 2026-09-04. The 2026-09-04
// outage wasn't a difficulty problem — it was that the solver used
// crypto.subtle.digest() per attempt, and WebCrypto's async dispatch cost
// dominated at real attempt counts even when batched with Promise.all.
// Cutting difficulty to 2 that night was a stopgap that traded away real
// bot-deterrence instead of fixing the actual bottleneck. The real fix:
// src/lib/shield/sha256.ts, a synchronous allocation-light SHA-256 with no
// per-attempt async overhead, benchmarked at ~450k hashes/sec (Node/V8,
// single core) — difficulty 4 averages well under a second even assuming
// mobile JSCore runs several times slower. Verified byte-for-byte against
// Node's own crypto.createHash before shipping.
export const DEFAULT_DIFFICULTY = 4;
export const CHALLENGE_EXPIRY_MS = 60_000; // 1 minute to solve challenge
export const CLEARANCE_TTL_SECONDS = 86_400; // 24 hours

// ── Per-zone shield policy ───────────────────────────────────────────────────
//
// Not every zone carries the same risk. Labs is a research-chemical catalog —
// scraping and automated ordering there are a compliance problem, not just a
// bandwidth one — so it re-verifies far more often and solves a harder puzzle.
// Tank is a livestream: nothing there needs a strict gate, and a long-lived
// clearance is the friendlier default.
//
// Two independent dials, deliberately separated:
//   difficulty          — how EXPENSIVE one solve is (bot cost per pass)
//   clearanceTtlSeconds — how OFTEN a visitor must solve again (freshness)
//
// Raising difficulty is the dial to be careful with: cost scales 16x per step
// (each step is one more required leading hex zero), and difficulty 4 already
// averages ~65,536 hashes. Prefer shortening the TTL over raising difficulty —
// it increases bot cost over time without ever making one page load feel slow.
export type ShieldZonePolicy = {
  /** Leading hex zeros required in the PoW hash. Each +1 is ~16x more work. */
  difficulty: number;
  /** How long a solved clearance stays valid before the zone re-challenges. */
  clearanceTtlSeconds: number;
};

/** Applied to every zone with no explicit entry below. */
export const DEFAULT_SHIELD_POLICY: ShieldZonePolicy = {
  difficulty: 3,
  clearanceTtlSeconds: CLEARANCE_TTL_SECONDS, // 24h
};

/** Keyed by zone key (getZoneFromHost), not hostname. */
export const ZONE_SHIELD_POLICY: Record<string, ShieldZonePolicy> = {
  // Research field — challenge harder and expire clearance quickly.
  labs: { difficulty: 4, clearanceTtlSeconds: 1_800 }, // 30 minutes
  // Tank — lightweight human verification check (sub-10ms solve)
  tank: { difficulty: 1, clearanceTtlSeconds: 86_400 }, // 24 hours
};
