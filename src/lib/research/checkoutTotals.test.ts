import { describe, expect, test } from "bun:test";
import { buildCheckoutBreakdown, calcPackageProtectionCents } from "./checkoutTotals";

describe("calcPackageProtectionCents", () => {
  test("is free when the customer opts out", () => {
    expect(calcPackageProtectionCents(50000, 0, false)).toBe(0);
  });

  test("is a flat $2.00 up to and including a $100 base", () => {
    expect(calcPackageProtectionCents(5000, 0, true)).toBe(200);
    expect(calcPackageProtectionCents(10000, 0, true)).toBe(200);
  });

  test("is 3% above a $100 base", () => {
    expect(calcPackageProtectionCents(10001, 0, true)).toBe(300);
    expect(calcPackageProtectionCents(20000, 0, true)).toBe(600);
  });

  test("is computed after discounts, so a discount can drop it to the flat fee", () => {
    expect(calcPackageProtectionCents(12000, 5000, true)).toBe(200);
  });

  test("never goes negative when the discount exceeds the subtotal", () => {
    expect(calcPackageProtectionCents(1000, 9999, true)).toBe(200);
  });
});

describe("buildCheckoutBreakdown", () => {
  test("total includes tax and package protection, minus discount", () => {
    const b = buildCheckoutBreakdown({
      subtotal_cents: 10000,
      shipping_cents: 500,
      tax_cents: 754,
      discount_cents: 1000,
      package_protection_cents: 200,
    });
    expect(b.total_cents).toBe(10000 + 500 + 754 - 1000 + 200);
  });
});
