import Stripe from "stripe";

export type CommerceStripeMode = "test" | "live";
export type PaymentLane = "shop" | "labs" | "pos" | "tank";

export function getCommerceStripeMode(lane: PaymentLane): CommerceStripeMode {
  const laneMode = process.env[`STRIPE_${lane.toUpperCase()}_MODE`];
  // Tank is deliberately fail-closed to test mode. It cannot inherit a broad
  // commerce cutover; taking it live requires STRIPE_TANK_MODE=live.
  const fallbackMode = lane === "tank" ? "test" : process.env.STRIPE_COMMERCE_MODE;
  const raw = (laneMode ?? fallbackMode ?? "test").trim().toLowerCase();
  if (raw !== "test" && raw !== "live") {
    throw new Error(`Stripe mode for ${lane} must be either test or live`);
  }
  return raw;
}

function laneKeyName(lane: PaymentLane, mode: CommerceStripeMode): string {
  return `STRIPE_${lane.toUpperCase()}_${mode === "live" ? "LIVE_" : ""}SECRET_KEY`;
}

function keyForMode(mode: CommerceStripeMode, lane?: PaymentLane): string {
  const laneKey = lane ? process.env[laneKeyName(lane, mode)] : undefined;
  const key = laneKey ?? (mode === "live"
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY);

  if (!key) {
    throw new Error(mode === "live"
      ? "STRIPE_LIVE_SECRET_KEY is not configured"
      : "STRIPE_SECRET_KEY is not configured");
  }

  const validPrefix = mode === "live"
    ? /^(sk|rk)_live_/
    : /^(sk|rk)_test_/;
  if (!validPrefix.test(key)) {
    throw new Error(`Configured Stripe key does not match ${mode} mode`);
  }

  return key;
}

export function createCommerceStripe(lane: PaymentLane): { stripe: Stripe; mode: CommerceStripeMode } {
  const mode = getCommerceStripeMode(lane);
  return { stripe: new Stripe(keyForMode(mode, lane)), mode };
}

export function getCommercePublishableKey(lane: PaymentLane, mode = getCommerceStripeMode(lane)): string {
  const lanePrefix = `NEXT_PUBLIC_STRIPE_${lane.toUpperCase()}`;
  const laneKey = mode === "live"
    ? process.env[`${lanePrefix}_LIVE_PUBLISHABLE_KEY`]
    : process.env[`${lanePrefix}_PUBLISHABLE_KEY`];
  const key = laneKey ?? (mode === "live"
    ? process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  if (!key) throw new Error(`Stripe ${mode} publishable key for ${lane} is not configured`);
  const expectedPrefix = mode === "live" ? "pk_live_" : "pk_test_";
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`Stripe publishable key for ${lane} does not match ${mode} mode`);
  }
  return key;
}

type VerifiedWebhook = {
  event: Stripe.Event;
  mode: CommerceStripeMode;
  stripe: Stripe;
};

/**
 * Test and live Stripe endpoints always have different signing secrets, even
 * when they post to the same URL. Try only explicitly configured secrets and
 * require the signed event's livemode flag to agree with that secret.
 */
export function constructCommerceWebhookEvent(body: string, signature: string): VerifiedWebhook {
  const candidates: Array<{
    mode: CommerceStripeMode;
    signingSecret: string | undefined;
  }> = [
    { mode: "live", signingSecret: process.env.STRIPE_LIVE_WEBHOOK_SECRET },
    { mode: "test", signingSecret: process.env.STRIPE_WEBHOOK_SECRET },
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    if (!candidate.signingSecret) continue;

    try {
      const verifier = new Stripe(keyForMode(candidate.mode));
      const event = verifier.webhooks.constructEvent(body, signature, candidate.signingSecret);
      if (event.livemode !== (candidate.mode === "live")) {
        throw new Error("Stripe event mode does not match its signing secret");
      }
      const object = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
      const rawLane = object.metadata?.payment_lane;
      const lane = rawLane === "shop" || rawLane === "labs" || rawLane === "pos" || rawLane === "tank"
        ? rawLane
        : undefined;
      if (candidate.mode === "live" && !lane) {
        throw new Error("Live Stripe event is missing payment_lane metadata");
      }
      return { event, mode: candidate.mode, stripe: new Stripe(keyForMode(candidate.mode, lane)) };
    } catch (error) {
      lastError = error;
    }
  }

  if (!candidates.some((candidate) => candidate.signingSecret)) {
    throw new Error("No Stripe webhook signing secret is configured");
  }
  throw lastError instanceof Error ? lastError : new Error("Invalid Stripe webhook signature");
}
