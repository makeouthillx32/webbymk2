import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  eventPaymentLane,
  getCommercePublishableKey,
  getCommerceStripeMode,
} from "./commerce";

const watched = [
  "STRIPE_COMMERCE_MODE",
  "STRIPE_SHOP_MODE",
  "STRIPE_LABS_MODE",
  "STRIPE_POS_MODE",
  "STRIPE_TANK_MODE",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY",
] as const;
const previous = new Map(watched.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of watched) delete process.env[key];
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_lane_test";
  process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY = "pk_live_lane_test";
});

afterAll(() => {
  for (const key of watched) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Stripe payment lane modes", () => {
  test("defaults every lane to test", () => {
    expect(getCommerceStripeMode("shop")).toBe("test");
    expect(getCommerceStripeMode("labs")).toBe("test");
    expect(getCommerceStripeMode("pos")).toBe("test");
    expect(getCommerceStripeMode("tank")).toBe("test");
  });

  test("switches one commerce lane without changing another", () => {
    process.env.STRIPE_SHOP_MODE = "live";
    process.env.STRIPE_LABS_MODE = "test";
    expect(getCommerceStripeMode("shop")).toBe("live");
    expect(getCommerceStripeMode("labs")).toBe("test");
    expect(getCommercePublishableKey("shop")).toBe("pk_live_lane_test");
    expect(getCommercePublishableKey("labs")).toBe("pk_test_lane_test");
  });

  test("Tank does not inherit a broad commerce live switch", () => {
    process.env.STRIPE_COMMERCE_MODE = "live";
    expect(getCommerceStripeMode("shop")).toBe("live");
    expect(getCommerceStripeMode("tank")).toBe("test");
  });

  test("rejects a publishable key from the wrong mode", () => {
    process.env.STRIPE_SHOP_MODE = "live";
    process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY = "pk_test_wrong_mode";
    expect(() => getCommercePublishableKey("shop")).toThrow("does not match live mode");
  });

  test("reads Tank lane metadata from current and legacy invoice payloads", () => {
    expect(eventPaymentLane({ data: { object: { metadata: { payment_lane: "tank" } } } } as any)).toBe("tank");
    expect(eventPaymentLane({ data: { object: { subscription_details: { metadata: { payment_lane: "tank" } } } } } as any)).toBe("tank");
    expect(eventPaymentLane({ data: { object: { parent: { subscription_details: { metadata: { payment_lane: "tank" } } } } } } as any)).toBe("tank");
  });
});
