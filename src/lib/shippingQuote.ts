import { createHmac, timingSafeEqual } from "node:crypto";

export type ShippingLane = "shop" | "labs";

type QuotePayload = {
  v: 1;
  lane: ShippingLane;
  cartId: string;
  subtotalCents: number;
  rateId: string;
  priceCents: number;
  name: string;
  expiresAt: number;
};

type ShippableRate = {
  id: string;
  name: string;
  price_cents: number;
  [key: string]: unknown;
};

function quoteSecret(): string {
  const secret = process.env.CHECKOUT_QUOTE_SECRET
    ?? process.env.STRIPE_WEBHOOK_SECRET
    ?? process.env.STRIPE_LIVE_WEBHOOK_SECRET;
  if (!secret) throw new Error("CHECKOUT_QUOTE_SECRET is not configured");
  return secret;
}

function signatureFor(encodedPayload: string): Buffer {
  return createHmac("sha256", quoteSecret()).update(encodedPayload).digest();
}

export function signShippingRates<T extends ShippableRate>(
  lane: ShippingLane,
  cartId: string,
  subtotalCents: number,
  rates: T[],
): Array<T & { quote_token: string }> {
  const expiresAt = Date.now() + 15 * 60 * 1000;
  return rates.map((rate) => {
    const payload: QuotePayload = {
      v: 1,
      lane,
      cartId,
      subtotalCents,
      rateId: rate.id,
      priceCents: rate.price_cents,
      name: rate.name,
      expiresAt,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = signatureFor(encoded).toString("base64url");
    return { ...rate, quote_token: `${encoded}.${signature}` };
  });
}

export function verifyShippingRateQuote(input: {
  token: unknown;
  lane: ShippingLane;
  cartId: string;
  subtotalCents: number;
  rateId: string;
}): { priceCents: number; name: string } | null {
  if (typeof input.token !== "string") return null;
  const [encoded, suppliedSignature, extra] = input.token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  try {
    const expected = signatureFor(encoded);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as QuotePayload;
    if (
      payload.v !== 1
      || payload.lane !== input.lane
      || payload.cartId !== input.cartId
      || payload.subtotalCents !== input.subtotalCents
      || payload.rateId !== input.rateId
      || !Number.isSafeInteger(payload.priceCents)
      || payload.priceCents < 0
      || typeof payload.name !== "string"
      || payload.expiresAt < Date.now()
    ) return null;

    return { priceCents: payload.priceCents, name: payload.name };
  } catch {
    return null;
  }
}
