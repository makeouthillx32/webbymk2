import { describe, expect, test } from "bun:test";
import {
  canEnterRoom,
  isMonthlyGrantDue,
  isPassActive,
  SEASON_PASS_MONTHLY_TOKENS,
  type ViewerPass,
} from "./seasonPass";

// Two ways to be wrong here, and they are not symmetric: locking a paying
// viewer out of a room they bought, or leaving a private room open. The first
// is a refund and an angry customer; the second is a private bedroom on the
// internet. The tests below lean on that asymmetry deliberately.

const NOW = new Date("2026-09-13T12:00:00Z");
const pass = (over: Partial<ViewerPass> = {}): ViewerPass => ({
  tier: "base",
  expiresAt: null,
  ...over,
});

describe("an ungated room is open — the default that must never deny", () => {
  test("no gate means anyone, signed in or not", () => {
    expect(canEnterRoom({ requiredPassTier: null }, null).allowed).toBe(true);
    expect(canEnterRoom({ requiredPassTier: null }, pass()).allowed).toBe(true);
  });

  test("a missing or malformed room still resolves to open", () => {
    // Every room that exists today has no gate. A lookup miss must not lock
    // the house.
    expect(canEnterRoom(null, null).allowed).toBe(true);
    expect(canEnterRoom(undefined, undefined).allowed).toBe(true);
  });
});

describe("a gated room asks for the right thing", () => {
  test("no pass is turned away with something to buy", () => {
    const res = canEnterRoom({ requiredPassTier: "base" }, null);
    expect(res).toEqual({ allowed: false, reason: "needs-pass", requiredTier: "base" });
  });

  test("base gets into a base room", () => {
    expect(canEnterRoom({ requiredPassTier: "base" }, pass(), NOW).allowed).toBe(true);
  });

  test("XL gets into a base room — it is the higher tier", () => {
    expect(canEnterRoom({ requiredPassTier: "base" }, pass({ tier: "xl" }), NOW).allowed).toBe(true);
  });

  test("base does NOT get into an XL room, and is told to upgrade", () => {
    // The distinct reason matters: "buy a season pass" is wrong advice for
    // someone who already has one.
    const res = canEnterRoom({ requiredPassTier: "xl" }, pass({ tier: "base" }), NOW);
    expect(res).toEqual({ allowed: false, reason: "needs-upgrade", requiredTier: "xl" });
  });

  test("an expired pass is told it lapsed, not that it never existed", () => {
    const res = canEnterRoom(
      { requiredPassTier: "base" },
      pass({ expiresAt: "2026-09-01T00:00:00Z" }),
      NOW,
    );
    expect(res).toEqual({ allowed: false, reason: "expired", requiredTier: "base" });
  });
});

describe("when a pass counts as active", () => {
  test("no expiry recorded counts as active", () => {
    // One-off purchases predate the subscription model; revoking them silently
    // would take away something already paid for.
    expect(isPassActive(pass({ expiresAt: null }), NOW)).toBe(true);
  });

  test("a future expiry is active, a past one is not", () => {
    expect(isPassActive(pass({ expiresAt: "2026-12-01T00:00:00Z" }), NOW)).toBe(true);
    expect(isPassActive(pass({ expiresAt: "2026-08-01T00:00:00Z" }), NOW)).toBe(false);
  });

  test("an unparseable expiry keeps the viewer in", () => {
    // Erring toward access on bad DATA. A stuck-open gate is recoverable; a
    // paying customer locked out by a malformed timestamp is not.
    expect(isPassActive(pass({ expiresAt: "not a date" }), NOW)).toBe(true);
  });

  test("no tier is never active, whatever the expiry says", () => {
    expect(isPassActive(pass({ tier: null, expiresAt: "2099-01-01T00:00:00Z" }), NOW)).toBe(false);
    expect(isPassActive(null, NOW)).toBe(false);
  });
});

describe("the monthly token grant does not mint currency", () => {
  test("a fresh active pass is due", () => {
    expect(isMonthlyGrantDue(pass(), null, NOW)).toBe(true);
  });

  test("granted yesterday is not due again", () => {
    expect(isMonthlyGrantDue(pass(), "2026-09-12T12:00:00Z", NOW)).toBe(false);
  });

  test("granted 30 days ago is due", () => {
    expect(isMonthlyGrantDue(pass(), "2026-08-14T11:00:00Z", NOW)).toBe(true);
  });

  test("a lapsed pass stops accruing", () => {
    expect(isMonthlyGrantDue(pass({ expiresAt: "2026-08-01T00:00:00Z" }), null, NOW)).toBe(false);
  });

  test("an unparseable last-granted REFUSES rather than grants", () => {
    // Opposite lean to the access check, on purpose: being wrong here mints
    // real currency, so bad data must never mean "yes".
    expect(isMonthlyGrantDue(pass(), "garbage", NOW)).toBe(false);
  });

  test("the allowances are the operator's figures, not placeholders", () => {
    // Pinned deliberately. These started as 500/2500 invented by me and were
    // corrected to 100/350; asserting the shape only ("xl > base") would have
    // passed happily against the wrong numbers.
    expect(SEASON_PASS_MONTHLY_TOKENS.base).toBe(100);
    expect(SEASON_PASS_MONTHLY_TOKENS.xl).toBe(350);
    expect(SEASON_PASS_MONTHLY_TOKENS.xl).toBeGreaterThan(SEASON_PASS_MONTHLY_TOKENS.base);
  });

  test("a pass allowance is always a grant, never a debit", () => {
    // Buying a pass costs MONEY, not tokens. A negative here would silently
    // charge currency for a purchase already paid for in cash.
    for (const amount of Object.values(SEASON_PASS_MONTHLY_TOKENS)) {
      expect(amount).toBeGreaterThan(0);
    }
  });
});
