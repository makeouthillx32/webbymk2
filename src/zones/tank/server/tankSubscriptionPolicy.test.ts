import { describe, expect, test } from "bun:test";
import {
  canUpgradeSubscription,
  earliestSubscriptionPeriodStart,
  isEntitledSubscriptionStatus,
  isTerminalSubscriptionStatus,
  latestSubscriptionPeriodEnd,
  resolveTankSubscriptionProduct,
  tokensStillOwedForPeriod,
} from "./tankSubscriptionPolicy";

describe("Tank subscription policy", () => {
  test("maps only the two recurring pass products", () => {
    // Allowances are the operator's figures (100 / 350), pinned in
    // seasonPass.test.ts too. The 500/2500 these asserted first were
    // placeholders that reached the catalogue before being corrected.
    expect(resolveTankSubscriptionProduct("season_pass")).toEqual({
      productKey: "season_pass",
      tier: "base",
      monthlyTokens: 100,
    });
    expect(resolveTankSubscriptionProduct("season_pass_xl")).toEqual({
      productKey: "season_pass_xl",
      tier: "xl",
      monthlyTokens: 350,
    });
    expect(resolveTankSubscriptionProduct("tokens_500")).toBeNull();
  });

  test("entitles only active or trialing subscriptions", () => {
    expect(isEntitledSubscriptionStatus("active")).toBe(true);
    expect(isEntitledSubscriptionStatus("trialing")).toBe(true);
    expect(isEntitledSubscriptionStatus("past_due")).toBe(false);
  });

  test("recognizes terminal statuses and the latest item period", () => {
    expect(isTerminalSubscriptionStatus("canceled")).toBe(true);
    expect(isTerminalSubscriptionStatus("active")).toBe(false);
    expect(latestSubscriptionPeriodEnd([1_700_000_000, 1_800_000_000])).toBe(
      "2027-01-15T08:00:00.000Z",
    );
    expect(latestSubscriptionPeriodEnd([])).toBeNull();
  });
});

describe("upgrading a season pass", () => {
  test("base moves up to xl", () => {
    expect(canUpgradeSubscription("base", "xl", "active")).toEqual({
      allowed: true,
      from: "base",
      to: "xl",
    });
  });

  test("trialing may upgrade too", () => {
    expect(canUpgradeSubscription("base", "xl", "trialing").allowed).toBe(true);
  });

  test("someone with no pass is not upgrading, they are buying", () => {
    expect(canUpgradeSubscription(null, "xl", "active")).toEqual({
      allowed: false,
      reason: "no-subscription",
    });
  });

  test("the tier you already hold is refused", () => {
    expect(canUpgradeSubscription("xl", "xl", "active")).toEqual({
      allowed: false,
      reason: "same-tier",
    });
  });

  test("xl down to base is refused, not silently performed", () => {
    // A downgrade owes money back. Swapping the price with no refund path
    // would charge xl rates for a period already paid at xl and hand back
    // nothing.
    expect(canUpgradeSubscription("xl", "base", "active")).toEqual({
      allowed: false,
      reason: "downgrade-unsupported",
    });
  });

  test("past_due and canceled cannot upgrade", () => {
    for (const status of ["past_due", "canceled", "unpaid", "incomplete", ""]) {
      expect(canUpgradeSubscription("base", "xl", status)).toEqual({
        allowed: false,
        reason: "not-entitled",
      });
    }
  });
});

describe("what an invoice still owes in tokens", () => {
  test("a fresh period pays the whole allowance", () => {
    expect(tokensStillOwedForPeriod("base", 0)).toBe(100);
    expect(tokensStillOwedForPeriod("xl", 0)).toBe(350);
  });

  test("upgrading mid-period pays only the difference", () => {
    // The whole point: base already paid 100 this month, so the xl invoice
    // owes 250 -- not another 350 on top.
    expect(tokensStillOwedForPeriod("xl", 100)).toBe(250);
  });

  test("a duplicate delivery in the same period owes nothing", () => {
    expect(tokensStillOwedForPeriod("base", 100)).toBe(0);
    expect(tokensStillOwedForPeriod("xl", 350)).toBe(0);
  });

  test("never negative, whatever the period already paid", () => {
    // A downgrade reaching this code must not produce a debit.
    expect(tokensStillOwedForPeriod("base", 350)).toBe(0);
    expect(tokensStillOwedForPeriod("base", 99999)).toBe(0);
  });

  test("garbage in the already-granted figure does not mint tokens", () => {
    expect(tokensStillOwedForPeriod("base", Number.NaN)).toBe(100);
    expect(tokensStillOwedForPeriod("base", -500)).toBe(100);
  });
});

describe("period start", () => {
  test("takes the earliest item and ignores blanks", () => {
    expect(earliestSubscriptionPeriodStart([1_800_000_000, 1_700_000_000])).toBe(
      new Date(1_700_000_000 * 1000).toISOString(),
    );
    expect(earliestSubscriptionPeriodStart([null, 1_700_000_000, undefined])).toBe(
      new Date(1_700_000_000 * 1000).toISOString(),
    );
  });

  test("no usable value is null, not epoch zero", () => {
    // Falling back to 1970 would make every grant look like it happened
    // outside the period, re-granting tokens on every invoice.
    expect(earliestSubscriptionPeriodStart([])).toBeNull();
    expect(earliestSubscriptionPeriodStart([null, undefined, 0])).toBeNull();
  });
});
