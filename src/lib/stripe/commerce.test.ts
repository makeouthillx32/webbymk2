import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  constructCommerceWebhookEvent,
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
  "STRIPE_SECRET_KEY",
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "STRIPE_SHOP_LIVE_SECRET_KEY",
  "STRIPE_SHOP_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_SHOP_LIVE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_SHOP_PUBLISHABLE_KEY",
  "STRIPE_SHOP_LIVE_WEBHOOK_SECRET",
  "STRIPE_SHOP_WEBHOOK_SECRET",
  "STRIPE_LABS_LIVE_SECRET_KEY",
  "STRIPE_LABS_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_LABS_LIVE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_LABS_PUBLISHABLE_KEY",
  "STRIPE_LABS_LIVE_WEBHOOK_SECRET",
  "STRIPE_LABS_WEBHOOK_SECRET",
  "STRIPE_TANK_LIVE_SECRET_KEY",
  "STRIPE_TANK_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_TANK_LIVE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_TANK_PUBLISHABLE_KEY",
  "STRIPE_TANK_LIVE_WEBHOOK_SECRET",
  "STRIPE_TANK_WEBHOOK_SECRET",
] as const;
const previous = new Map(watched.map((key) => [key, process.env[key]]));

function signedHeader(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

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

  test("verifies a Shop webhook with the Shop account secret and key", async () => {
    process.env.STRIPE_SHOP_LIVE_SECRET_KEY = "sk_live_shop_example";
    process.env.STRIPE_SHOP_LIVE_WEBHOOK_SECRET = "whsec_shop_example";
    const body = JSON.stringify({
      id: "evt_shop",
      object: "event",
      type: "payment_intent.succeeded",
      livemode: true,
      data: { object: { metadata: { payment_lane: "shop" } } },
    });
    const signature = signedHeader(body, process.env.STRIPE_SHOP_LIVE_WEBHOOK_SECRET);

    const verified = await constructCommerceWebhookEvent(body, signature);
    expect(verified.mode).toBe("live");
    expect(eventPaymentLane(verified.event)).toBe("shop");
  });

  test("does not accept Labs metadata through the Shop account webhook", async () => {
    process.env.STRIPE_SHOP_LIVE_SECRET_KEY = "sk_live_shop_example";
    process.env.STRIPE_SHOP_LIVE_WEBHOOK_SECRET = "whsec_shop_example";
    const body = JSON.stringify({
      id: "evt_wrong_lane",
      object: "event",
      type: "payment_intent.succeeded",
      livemode: true,
      data: { object: { metadata: { payment_lane: "labs" } } },
    });
    const signature = signedHeader(body, process.env.STRIPE_SHOP_LIVE_WEBHOOK_SECRET);

    await expect(constructCommerceWebhookEvent(body, signature)).rejects.toThrow(
      "does not belong to the shop lane",
    );
  });
});
