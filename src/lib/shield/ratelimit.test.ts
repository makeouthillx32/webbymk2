// src/lib/shield/ratelimit.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { globalRateLimiter, SlidingWindowLimiter } from "./ratelimit";

describe("Edge Shield Rate Limiter (default: per-IP, not subnet)", () => {
  beforeEach(() => {
    globalRateLimiter.clearAll();
  });

  it("allows initial requests within threshold", () => {
    const ip = "198.51.100.25";
    const res = globalRateLimiter.check(ip);
    expect(res.allowed).toBe(true);
    expect(res.challengeRequired).toBe(false);
    expect(res.isBlocked).toBe(false);
  });

  it("triggers challenge when burst threshold is reached", () => {
    const ip = "198.51.100.25";
    // Fire 125 requests (threshold is 120/min)
    for (let i = 0; i < 125; i++) {
      globalRateLimiter.record(ip);
    }

    const res = globalRateLimiter.check(ip);
    expect(res.allowed).toBe(true);
    expect(res.challengeRequired).toBe(true);
    expect(res.isBlocked).toBe(false);
  });

  // Regression test for the 2026-09-03 fix: a real crowd of Tank viewers
  // sharing a /24 (mobile carrier NAT, campus/office network) must NOT
  // share one rate-limit budget by default — that would 429-block a real
  // audience instead of a botnet. Each IP gets its own budget unless a
  // limiter explicitly opts into subnet aggregation (see the test below).
  it("does NOT aggregate by /24 subnet by default — each IP has its own budget", () => {
    // 100 requests each from two different IPs in the same /24 subnet —
    // neither individually crosses the 120/min challenge threshold.
    for (let i = 0; i < 100; i++) {
      globalRateLimiter.record("203.0.113.10");
      globalRateLimiter.record("203.0.113.20");
    }

    // A third IP in that same subnet, which has sent nothing itself, must
    // still be completely unaffected by its neighbors' traffic.
    const res = globalRateLimiter.check("203.0.113.99");
    expect(res.challengeRequired).toBe(false);
    expect(res.isBlocked).toBe(false);
  });

  it("hard blocks when volumetric attack threshold is reached", () => {
    const ip = "198.51.100.99";
    for (let i = 0; i < 405; i++) {
      globalRateLimiter.record(ip);
    }

    const res = globalRateLimiter.check(ip);
    expect(res.allowed).toBe(false);
    expect(res.isBlocked).toBe(true);
  });
});

describe("Edge Shield Rate Limiter (opt-in subnet aggregation)", () => {
  it("aggregates requests across the same /24 subnet when explicitly enabled", () => {
    // A dedicated instance, not the shared default — this mode is meant for
    // a deliberate "SHIELD_MODE=under_attack" escalation, never the default
    // posture for normal traffic.
    const limiter = new SlidingWindowLimiter({ aggregateBySubnet: true });

    // 65 requests each from two different IPs in the same /24 subnet.
    for (let i = 0; i < 65; i++) {
      limiter.record("203.0.113.10");
      limiter.record("203.0.113.20");
    }

    // A third IP in the same subnet checks in and inherits the group's load.
    const res = limiter.check("203.0.113.99");
    expect(res.challengeRequired).toBe(true);
  });
});

describe("a block must not renew itself", () => {
  // The bug this pins, in full: the block lasts 5 minutes but the window is 1
  // minute. Every rejected request used to be recorded anyway, so at the moment
  // a block expired the window was full of the client's own retries from the
  // last 60s of that block — and the next request re-blocked them for another 5
  // minutes. Anything that keeps polling renewed its own block forever. An
  // admin could not reach their own house console on 2026-09-12.

  it("requests made WHILE blocked are not counted", () => {
    const limiter = new SlidingWindowLimiter({
      windowMs: 60_000,
      maxRequestsBeforeChallenge: 5,
      maxRequestsBeforeBlock: 10,
      blockDurationMs: 300_000,
    });
    const ip = "203.0.113.7";

    for (let i = 0; i < 10; i++) limiter.record(ip);
    expect(limiter.check(ip).isBlocked).toBe(true);

    // The client keeps hammering — a polling tab, or a human refreshing.
    for (let i = 0; i < 500; i++) {
      limiter.record(ip);
      limiter.check(ip);
    }

    // None of that may have accumulated. Before the fix this was 500.
    expect(limiter.check(ip).count).toBe(0);
  });

  it("the window is emptied at the moment of blocking", () => {
    const limiter = new SlidingWindowLimiter({
      windowMs: 60_000,
      maxRequestsBeforeChallenge: 5,
      maxRequestsBeforeBlock: 10,
      blockDurationMs: 300_000,
    });
    const ip = "203.0.113.8";
    for (let i = 0; i < 10; i++) limiter.record(ip);

    const blocked = limiter.check(ip);
    expect(blocked.isBlocked).toBe(true);
    // Nothing carries over into the window that resumes after the block.
    expect(limiter.check(ip).count).toBe(0);
  });

  it("a client is usable again the moment the block lapses", () => {
    const limiter = new SlidingWindowLimiter({
      windowMs: 60_000,
      maxRequestsBeforeChallenge: 5,
      maxRequestsBeforeBlock: 10,
      // Short block so the lapse is observable without faking the clock.
      blockDurationMs: 20,
    });
    const ip = "203.0.113.9";

    for (let i = 0; i < 10; i++) limiter.record(ip);
    expect(limiter.check(ip).isBlocked).toBe(true);
    for (let i = 0; i < 200; i++) limiter.record(ip);

    return Bun.sleep(40).then(() => {
      const after = limiter.check(ip);
      expect(after.isBlocked).toBe(false);
      expect(after.count).toBe(0);
    });
  });

  it("an honest client below the threshold is never blocked", () => {
    const limiter = new SlidingWindowLimiter({
      windowMs: 60_000,
      maxRequestsBeforeChallenge: 5,
      maxRequestsBeforeBlock: 10,
      blockDurationMs: 300_000,
    });
    const ip = "203.0.113.10";
    for (let i = 0; i < 9; i++) limiter.record(ip);
    expect(limiter.check(ip).isBlocked).toBe(false);
  });
});
