import { describe, expect, test } from "bun:test";
import {
  DAY,
  evaluateSessionFreshness,
  getZoneSessionPolicy,
  ZONE_SESSION_POLICIES,
} from "./sessionPolicy";

// The point of this module: one shared session cookie, different freshness
// rules per zone. Tank remembers you until you clear cookies; the dashboard
// does not. Getting the failure direction wrong here logs real people out, so
// the fail-open behaviour is pinned explicitly.

const NOW = 1_800_000_000; // fixed epoch seconds

const evaluate = (
  zone: string,
  ageSeconds: number | null,
  env?: Record<string, string | undefined>,
) =>
  evaluateSessionFreshness({
    zone,
    signedIn: true,
    authAtSeconds: ageSeconds === null ? null : NOW - ageSeconds,
    nowSeconds: NOW,
    env: env ?? {},
  });

describe("zone policies", () => {
  test("tank never goes stale — the whole reason this exists", () => {
    expect(getZoneSessionPolicy("tank", {}).maxAgeSeconds).toBeNull();
    expect(evaluate("tank", 400 * DAY).fresh).toBe(true);
    expect(evaluate("tank", 400 * DAY).reason).toBe("no-limit");
  });

  test("core expires after a week, not half an hour", () => {
    expect(getZoneSessionPolicy("core", {}).maxAgeSeconds).toBe(7 * DAY);
    expect(evaluate("core", 30 * 60).fresh).toBe(true); // 30 min: the old pain
    expect(evaluate("core", 6 * DAY).fresh).toBe(true);
    expect(evaluate("core", 8 * DAY).fresh).toBe(false);
    expect(evaluate("core", 8 * DAY).reason).toBe("expired");
  });

  test("exactly at the boundary is still fresh", () => {
    expect(evaluate("core", 7 * DAY).fresh).toBe(true);
    expect(evaluate("core", 7 * DAY + 1).fresh).toBe(false);
  });

  test("the auth zone is never gated — gating sign-in would loop", () => {
    expect(getZoneSessionPolicy("auth", {}).maxAgeSeconds).toBeNull();
    expect(evaluate("auth", 999 * DAY).fresh).toBe(true);
  });

  test("shop favours a fast return — guest checkout means auth is convenience", () => {
    expect(getZoneSessionPolicy("shop", {}).maxAgeSeconds).toBe(30 * DAY);
    expect(evaluate("shop", 29 * DAY).fresh).toBe(true);
    expect(evaluate("shop", 31 * DAY).fresh).toBe(false);
  });

  test("labs is a compliance surface, NOT a storefront like shop", () => {
    // Age-21 + research-use gate, and sign-in is required to check out (shop
    // allows guests). Treating it like shop would leave a month-old identity
    // buying controlled research material.
    expect(getZoneSessionPolicy("labs", {}).maxAgeSeconds).toBe(7 * DAY);
    expect(getZoneSessionPolicy("labs", {}).maxAgeSeconds).toBeLessThan(
      getZoneSessionPolicy("shop", {}).maxAgeSeconds!,
    );
    expect(evaluate("labs", 8 * DAY).fresh).toBe(false);
  });

  test("reading surfaces are moderate, never immortal", () => {
    // blog publishing uses a Bearer token, not a session; docs has no auth
    // surface at all. Both values are near-inert — kept finite so a future
    // gated page cannot inherit "forever" by accident.
    for (const zone of ["blog", "docs"]) {
      const limit = getZoneSessionPolicy(zone, {}).maxAgeSeconds;
      expect(limit).not.toBeNull();
      expect(limit).toBe(30 * DAY);
    }
  });

  test("every real auth-bearing zone name is keyed, not left to the fallback", () => {
    // The zone names middleware can actually pass. multiZone.ts calls the core
    // zone "unenter" while middleware passes "core" for isCoreHost, and
    // dashboard/app are the two zones with requiresAuth: true. A typo here
    // would silently fall through to the default instead of failing.
    for (const zone of ["core", "unenter", "dashboard", "app"]) {
      expect(ZONE_SESSION_POLICIES[zone]).toBeDefined();
      expect(getZoneSessionPolicy(zone, {}).maxAgeSeconds).toBe(7 * DAY);
      expect(evaluate(zone, 30 * 60).fresh).toBe(true);
      expect(evaluate(zone, 8 * DAY).fresh).toBe(false);
    }
  });

  test("an unlisted zone inherits the conservative default, not 'never'", () => {
    const policy = getZoneSessionPolicy("some-new-zone", {});
    expect(policy.maxAgeSeconds).toBe(7 * DAY);
    expect(evaluate("some-new-zone", 8 * DAY).fresh).toBe(false);
  });

  test("every declared policy carries a rationale", () => {
    for (const [zone, policy] of Object.entries(ZONE_SESSION_POLICIES)) {
      expect(policy.rationale.length).toBeGreaterThan(0);
      expect(typeof zone).toBe("string");
    }
  });
});

describe("env overrides", () => {
  test("a per-zone override wins over the default", () => {
    const env = { AUTH_SESSION_MAX_AGE_CORE: String(2 * DAY) };
    expect(getZoneSessionPolicy("core", env).maxAgeSeconds).toBe(2 * DAY);
    expect(evaluate("core", 3 * DAY, env).fresh).toBe(false);
  });

  test("'never' disables the limit for a zone", () => {
    const env = { AUTH_SESSION_MAX_AGE_CORE: "never" };
    expect(getZoneSessionPolicy("core", env).maxAgeSeconds).toBeNull();
    expect(evaluate("core", 900 * DAY, env).fresh).toBe(true);
  });

  test("a limit can be added to tank if it ever needs one", () => {
    const env = { AUTH_SESSION_MAX_AGE_TANK: String(DAY) };
    expect(getZoneSessionPolicy("tank", env).maxAgeSeconds).toBe(DAY);
    expect(evaluate("tank", 2 * DAY, env).fresh).toBe(false);
  });

  test("hyphenated zone names map to underscored env vars", () => {
    const env = { AUTH_SESSION_MAX_AGE_UNENTER_PW: String(DAY) };
    expect(getZoneSessionPolicy("unenter-pw", env).maxAgeSeconds).toBe(DAY);
  });

  test("garbage overrides are ignored rather than obeyed", () => {
    for (const bad of ["abc", "-5", "", "   "]) {
      expect(getZoneSessionPolicy("core", { AUTH_SESSION_MAX_AGE_CORE: bad }).maxAgeSeconds).toBe(
        7 * DAY,
      );
    }
  });
});

describe("fail-open guarantees", () => {
  test("an unknown sign-in age is treated as fresh, never as expired", () => {
    // Shipping this must not log out everyone who is already signed in and has
    // no timestamp cookie yet.
    const verdict = evaluate("core", null);
    expect(verdict.fresh).toBe(true);
    expect(verdict.reason).toBe("unknown-age");
  });

  test("a non-finite timestamp is treated as unknown, not as epoch 0", () => {
    const verdict = evaluateSessionFreshness({
      zone: "core",
      signedIn: true,
      authAtSeconds: Number.NaN,
      nowSeconds: NOW,
      env: {},
    });
    expect(verdict.fresh).toBe(true);
    expect(verdict.reason).toBe("unknown-age");
  });

  test("a future timestamp cannot be made to look expired by clock skew", () => {
    const verdict = evaluateSessionFreshness({
      zone: "core",
      signedIn: true,
      authAtSeconds: NOW + 10 * DAY,
      nowSeconds: NOW,
      env: {},
    });
    expect(verdict.fresh).toBe(true);
    expect(verdict.ageSeconds).toBe(0);
  });

  test("not signed in is not a freshness question", () => {
    const verdict = evaluateSessionFreshness({
      zone: "tank",
      signedIn: false,
      authAtSeconds: NOW,
      nowSeconds: NOW,
      env: {},
    });
    expect(verdict.fresh).toBe(false);
    expect(verdict.reason).toBe("not-signed-in");
  });
});
