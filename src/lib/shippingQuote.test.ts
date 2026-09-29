import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { signShippingRates, verifyShippingRateQuote } from "./shippingQuote";

const previousSecret = process.env.CHECKOUT_QUOTE_SECRET;

beforeEach(() => {
  process.env.CHECKOUT_QUOTE_SECRET = "shipping-quote-test-secret";
});

afterAll(() => {
  if (previousSecret === undefined) delete process.env.CHECKOUT_QUOTE_SECRET;
  else process.env.CHECKOUT_QUOTE_SECRET = previousSecret;
});

describe("shipping quote integrity", () => {
  test("accepts the unchanged signed rate", () => {
    const [rate] = signShippingRates("shop", "cart-1", 4200, [{
      id: "usps-ground",
      name: "Ground",
      price_cents: 725,
    }]);

    expect(verifyShippingRateQuote({
      token: rate.quote_token,
      lane: "shop",
      cartId: "cart-1",
      subtotalCents: 4200,
      rateId: "usps-ground",
    })).toEqual({ priceCents: 725, name: "Ground" });
  });

  test("rejects tampering and cross-lane reuse", () => {
    const [rate] = signShippingRates("shop", "cart-1", 4200, [{
      id: "usps-ground",
      name: "Ground",
      price_cents: 725,
    }]);

    expect(verifyShippingRateQuote({
      token: `${rate.quote_token.slice(0, -1)}x`,
      lane: "shop",
      cartId: "cart-1",
      subtotalCents: 4200,
      rateId: "usps-ground",
    })).toBeNull();

    expect(verifyShippingRateQuote({
      token: rate.quote_token,
      lane: "labs",
      cartId: "cart-1",
      subtotalCents: 4200,
      rateId: "usps-ground",
    })).toBeNull();
  });

  test("rejects a quote after the authoritative cart subtotal changes", () => {
    const [rate] = signShippingRates("shop", "cart-1", 4200, [{
      id: "usps-ground",
      name: "Ground",
      price_cents: 725,
    }]);

    expect(verifyShippingRateQuote({
      token: rate.quote_token,
      lane: "shop",
      cartId: "cart-1",
      subtotalCents: 1,
      rateId: "usps-ground",
    })).toBeNull();
  });
});
