import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { paymentEventIdentity } from "./paymentAudit";

function event(object: Record<string, unknown>, type = "payment_intent.succeeded") {
  return {
    id: "evt_test_1",
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("payment lane audit identity", () => {
  test("records exact cents, currency, mode, and internal owner", () => {
    const identity = paymentEventIdentity(event({
      id: "pi_test_1",
      amount: 1299,
      currency: "USD",
      metadata: { payment_lane: "shop", order_id: "00000000-0000-0000-0000-000000000001" },
    }), "test");

    expect(identity).toMatchObject({
      stripe_event_id: "evt_test_1",
      stripe_object_id: "pi_test_1",
      lane: "shop",
      mode: "test",
      amount_cents: 1299,
      currency: "usd",
      order_id: "00000000-0000-0000-0000-000000000001",
    });
  });

  test("infers Tank for a legacy test event with a purchase id", () => {
    const identity = paymentEventIdentity(event({
      id: "pi_test_tank",
      amount: 500,
      currency: "usd",
      metadata: { tank_purchase_id: "00000000-0000-0000-0000-000000000002", product_key: "tokens_500" },
    }), "test");
    expect(identity?.lane).toBe("tank");
    expect(identity?.product_key).toBe("tokens_500");
  });

  test("does not guess an unidentifiable lane", () => {
    expect(paymentEventIdentity(event({
      id: "pi_old",
      amount: 100,
      currency: "usd",
      metadata: {},
    }), "test")).toBeNull();
  });
});
