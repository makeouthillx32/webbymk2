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
