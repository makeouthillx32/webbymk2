import { describe, expect, test } from "bun:test";
import { isTankBackstagePath, sessionPolicyKey, TANK_BACKSTAGE_PREFIXES } from "./backstage";
import { evaluateSessionFreshness, getZoneSessionPolicy, DAY } from "./sessionPolicy";

// This list does two jobs at once — it decides what needs a sign-in AND what
// gets the tighter session ceiling. Both failure directions are bad: too wide
// and OBS browser sources start demanding a login they cannot provide; too
// narrow and an operator console renders to the public.

describe("what counts as Tank backstage", () => {
  test("the operator surfaces match", () => {
    for (const p of [
      "/admin",
      "/admin/",
      "/admin/cameras",
      "/director-configuration",
      "/director",
      "/director/anything",
    ]) {
      expect(isTankBackstagePath(p)).toBe(true);
    }
  });

  test("/director-configuration and /director are included — they were the gap", () => {
    // Both returned 200 unauthenticated on production before this list existed.
    expect(isTankBackstagePath("/director-configuration")).toBe(true);
    expect(isTankBackstagePath("/director")).toBe(true);
    expect(TANK_BACKSTAGE_PREFIXES).toContain("/director-configuration");
  });

  test("OBS browser sources are NOT backstage — gating them breaks every scene", () => {
    // These load in OBS's embedded browser with no session at all, by design.
    for (const p of [
      "/obs",
      "/obs/director",
      "/obs/room-offline",
      "/obs/stream",
      "/overlay/director",
    ]) {
      expect(isTankBackstagePath(p)).toBe(false);
    }
  });

  test("viewer surfaces are untouched", () => {
    for (const p of ["/", "/rooms", "/rooms/foyer", "/cameras", "/browse", "/archives", "/home"]) {
      expect(isTankBackstagePath(p)).toBe(false);
    }
  });

  test("prefix matching is exact-or-slash, not substring", () => {
    // "/directors-cut" must not match "/director"; "/administrator" must not
    // match "/admin".
    expect(isTankBackstagePath("/directors-cut")).toBe(false);
    expect(isTankBackstagePath("/administrator")).toBe(false);
    expect(isTankBackstagePath("/director-configuration-old")).toBe(false);
  });
});

describe("sessionPolicyKey", () => {
  test("Tank backstage gets its own key, viewing keeps the zone key", () => {
    expect(sessionPolicyKey("tank", "/admin")).toBe("tank:backstage");
    expect(sessionPolicyKey("tank", "/director-configuration")).toBe("tank:backstage");
    expect(sessionPolicyKey("tank", "/rooms/foyer")).toBe("tank");
    expect(sessionPolicyKey("tank", "/obs/director")).toBe("tank");
  });

  test("other zones are unaffected by the Tank carve-out", () => {
    // A /director path on another zone is not Tank's console.
    expect(sessionPolicyKey("shop", "/admin")).toBe("shop");
    expect(sessionPolicyKey("labs", "/director")).toBe("labs");
  });
});

describe("the ceiling actually differs", () => {
  const at = (key: string, ageSeconds: number) =>
    evaluateSessionFreshness({
      zone: key,
      signedIn: true,
      authAtSeconds: 1_800_000_000 - ageSeconds,
      nowSeconds: 1_800_000_000,
      env: {},
    });

  test("viewing never goes stale, the console does after a week", () => {
    expect(getZoneSessionPolicy("tank", {}).maxAgeSeconds).toBeNull();
    expect(getZoneSessionPolicy("tank:backstage", {}).maxAgeSeconds).toBe(7 * DAY);

    // The whole point, side by side: a year-old session still watches, but is
    // asked to re-authenticate before running the house.
    expect(at("tank", 365 * DAY).fresh).toBe(true);
    expect(at("tank:backstage", 365 * DAY).fresh).toBe(false);
    expect(at("tank:backstage", 6 * DAY).fresh).toBe(true);
  });

  test("the composite key produces a legal env var name", () => {
    // ":" would be illegal in an env name; the sanitiser maps it to "_".
    const env = { AUTH_SESSION_MAX_AGE_TANK_BACKSTAGE: String(DAY) };
    expect(getZoneSessionPolicy("tank:backstage", env).maxAgeSeconds).toBe(DAY);
  });

  test("backstage can be opted out of entirely if it ever gets in the way", () => {
    const env = { AUTH_SESSION_MAX_AGE_TANK_BACKSTAGE: "never" };
    expect(getZoneSessionPolicy("tank:backstage", env).maxAgeSeconds).toBeNull();
  });
});
