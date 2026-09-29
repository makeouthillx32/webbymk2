// src/lib/research/checkoutTotals.ts
//
// Single definition of the Labs package-protection fee. Previously the
// offline (Zelle) route, the payment page, and — not at all — the card
// (create-payment-intent) route each did their own thing: the card route
// ignored the toggle entirely while the page added it to the displayed
// total, so a card checkout showed one amount and Stripe charged another
// (found in the 2026-09-24 Labs end-to-end test: button said $107.12,
// Stripe charged $111.54). The server is the source of truth; the page
// displays what these routes return.

/**
 * $2.00 when the base is <= $100, otherwise 3% of the base. The base is the
 * subtotal AFTER discounts and BEFORE shipping and tax — exactly what the
 * checkout page's fine print promises.
 */
export function calcPackageProtectionCents(
  subtotalCents: number,
  discountCents: number,
  enabled: boolean,
): number {
  if (!enabled) return 0;
  const base = Math.max(0, subtotalCents - discountCents);
  return base <= 10000 ? 200 : Math.round(base * 0.03);
}

export type ResearchCheckoutBreakdown = {
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  discount_cents: number;
  package_protection_cents: number;
  total_cents: number;
};

export function buildCheckoutBreakdown(input: {
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  discount_cents: number;
  package_protection_cents: number;
}): ResearchCheckoutBreakdown {
  return {
    ...input,
    total_cents:
      input.subtotal_cents +
      input.shipping_cents +
      input.tax_cents -
      input.discount_cents +
      input.package_protection_cents,
  };
}
