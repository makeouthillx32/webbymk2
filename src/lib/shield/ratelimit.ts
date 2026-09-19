// src/lib/shield/ratelimit.ts
// ─────────────────────────────────────────────────────────────────────────────
// High-performance, in-memory sliding-window rate limiter with subnet
// aggregation (/24 IPv4, /64 IPv6) for Unenter Edge Shield.
// ─────────────────────────────────────────────────────────────────────────────

import { getClientSubnet } from "./crypto";

interface WindowRecord {
  timestamps: number[];
  blockedUntil?: number;
}

export interface RateLimitConfig {
  windowMs: number; // Time window in ms (e.g. 60,000 for 1 minute)
  maxRequestsBeforeChallenge: number; // Bursts beyond this trigger PoW challenge
  maxRequestsBeforeBlock: number; // Volumetric floods beyond this get temporarily blocked
  blockDurationMs: number; // How long to block on hard threshold (e.g. 5 minutes)
  // Off by default — see the comment on DEFAULT_RATE_LIMIT_CONFIG below for
  // why grouping by /24 must never be the default posture for a site whose
  // whole point is a real crowd of simultaneous viewers.
  aggregateBySubnet: boolean;
}

// Verified live 2026-09-03: with aggregateBySubnet defaulted true, every
// non-localhost client was bucketed by /24 IPv4 subnet (256 addresses) and
// SHARED one 60-req/min-before-challenge, 180-req/min-before-block budget.
// Tank counts every open tab as a viewer (camera polling, presence
// heartbeats, chat) — a real crowd of viewers behind the same mobile
// carrier NAT or campus/office network shares a /24, so a genuinely good
// moment (lots of people watching one room) was the exact scenario that
// would 429-block a real audience, not a botnet. Fixed by keying on
// individual IP by default — a real distributed attack still gets caught
// per-source, it just no longer takes a whole shared-NAT audience down
// with it. Subnet aggregation is kept as an explicit opt-in (construct a
// SlidingWindowLimiter with aggregateBySubnet: true) for a future
// "SHIELD_MODE=under_attack" escalation path, not the default posture.
// Thresholds were also raised from 60/180 to 120/400 per minute — the old
// numbers were sized for a whole subnet's worth of traffic; a single real
// browser tab doing normal Tank activity (camera thumbnail polling, a
// presence heartbeat, chat sends, RNG game clicks) can plausibly clear 60
// req/min on its own well within legitimate use.
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequestsBeforeChallenge: 120,
  maxRequestsBeforeBlock: 400,
  blockDurationMs: 300_000, // 5 mins
  aggregateBySubnet: false,
};

export class SlidingWindowLimiter {
  private records = new Map<string, WindowRecord>();
  private lastCleanup = Date.now();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  private cleanup(now: number) {
    if (now - this.lastCleanup < 30_000) return;
    this.lastCleanup = now;
    const cutoff = now - this.config.windowMs;

    for (const [key, record] of this.records.entries()) {
      if (record.blockedUntil && record.blockedUntil > now) continue;
      // Filter out stale timestamps
      record.timestamps = record.timestamps.filter((t) => t > cutoff);
      if (record.timestamps.length === 0 && !record.blockedUntil) {
        this.records.delete(key);
      }
    }
  }

  public check(ip: string): {
    allowed: boolean;
    challengeRequired: boolean;
    isBlocked: boolean;
    count: number;
    remaining: number;
    resetMs: number;
  } {
    const now = Date.now();
    this.cleanup(now);

    const key = this.keyFor(ip);
    const record = this.records.get(key) || { timestamps: [] };

    // Check if hard blocked
    if (record.blockedUntil && record.blockedUntil > now) {
      return {
        allowed: false,
        challengeRequired: true,
        isBlocked: true,
        count: record.timestamps.length,
        remaining: 0,
        resetMs: record.blockedUntil - now,
      };
    }

    // Filter to current sliding window
    const cutoff = now - this.config.windowMs;
    const activeTimestamps = record.timestamps.filter((t) => t > cutoff);
    const count = activeTimestamps.length;

    // Hard block threshold exceeded
    if (count >= this.config.maxRequestsBeforeBlock) {
      record.blockedUntil = now + this.config.blockDurationMs;
      // Start the next window EMPTY. Together with record() refusing to count
      // while blocked, this is what stops a block from renewing itself — see
      // the note on record().
      record.timestamps = [];
      this.records.set(key, record);
      return {
        allowed: false,
        challengeRequired: true,
        isBlocked: true,
        count,
        remaining: 0,
        resetMs: this.config.blockDurationMs,
      };
    }

    // Challenge threshold exceeded
    const challengeRequired = count >= this.config.maxRequestsBeforeChallenge;
    const remaining = Math.max(0, this.config.maxRequestsBeforeChallenge - count);
    const oldestTimestamp = activeTimestamps[0] || now;
    const resetMs = Math.max(0, oldestTimestamp + this.config.windowMs - now);

    return {
      allowed: true,
      challengeRequired,
      isBlocked: false,
      count,
      remaining,
      resetMs,
    };
  }

  /**
   * Count one request against a client.
   *
   * A request that is currently BLOCKED is not counted, and that is the whole
   * reason this method has a comment.
   *
   * Previously every rejected request was still recorded. The block lasts 5
   * minutes but the window is only 1 minute, so at the moment a block expired
   * the window was full of the client's own retries from the last 60 seconds of
   * that block — and the very next request re-blocked them for another 5
   * minutes. Anything that keeps polling (a Tank tab doing camera, presence and
   * chat requests; an OBS browser source; a human pressing refresh) therefore
   * renewed its own block indefinitely. Observed 2026-09-12 as an admin who
   * could not reach their own house console, with retryAfterMs resetting to ~5
   * minutes on every attempt.
   *
   * Refusing a request must never make the hole deeper.
   */
  public record(ip: string): void {
    const now = Date.now();
    const key = this.keyFor(ip);
    const record = this.records.get(key) || { timestamps: [] };

    if (record.blockedUntil && record.blockedUntil > now) {
      this.records.set(key, record);
      return;
    }

    const cutoff = now - this.config.windowMs;
    record.timestamps = record.timestamps.filter((t) => t > cutoff);
    record.timestamps.push(now);

    this.records.set(key, record);
  }

  private keyFor(ip: string): string {
    const subnet = getClientSubnet(ip);
    return this.config.aggregateBySubnet && subnet !== "localhost"
      ? `subnet:${subnet}`
      : `ip:${ip}`;
  }

  public reset(ip: string): void {
    this.records.delete(this.keyFor(ip));
  }

  public clearAll(): void {
    this.records.clear();
  }

  public getStats(): { totalTrackedSubnets: number; activeBlocks: number } {
    const now = Date.now();
    let activeBlocks = 0;
    for (const record of this.records.values()) {
      if (record.blockedUntil && record.blockedUntil > now) {
        activeBlocks++;
      }
    }
    return {
      totalTrackedSubnets: this.records.size,
      activeBlocks,
    };
  }
}

export const globalRateLimiter = new SlidingWindowLimiter();
