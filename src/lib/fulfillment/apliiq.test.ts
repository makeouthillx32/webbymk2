import { afterEach, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
mock.module("server-only", () => ({}));

const {
  apliiqExternalProductId,
  apliiqProductSchema,
  apliiqWeightGrams,
  hasValidApliiqAppId,
  hasValidApliiqCallbackToken,
  isAllowedApliiqImageUrl,
  shopSlug,
  verifyApliiqHmac,
} = await import("./apliiq");

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Apliiq callback boundary", () => {
  it("requires the configured callback token and app id", () => {
    process.env.APLIIQ_CALLBACK_TOKEN = "callback-secret";
    process.env.APLIIQ_APP_ID = "app-123";
    expect(hasValidApliiqCallbackToken(new URL("https://shop.unenter.live/api?token=callback-secret"))).toBe(true);
    expect(hasValidApliiqCallbackToken(new URL("https://shop.unenter.live/api?token=wrong"))).toBe(false);
    expect(hasValidApliiqAppId("app-123")).toBe(true);
    expect(hasValidApliiqAppId("other")).toBe(false);
  });

  it("verifies the documented HMAC over the base64 payload", () => {
    const raw = JSON.stringify({ fulfillment: { order_id: "order-1" } });
    process.env.APLIIQ_SHARED_SECRET = "shared-secret";
    const signature = createHmac("sha256", "shared-secret")
      .update(Buffer.from(raw, "utf8").toString("base64"))
      .digest("base64");
    expect(verifyApliiqHmac(raw, signature)).toBe(true);
    expect(verifyApliiqHmac(`${raw} `, signature)).toBe(false);
  });

  it("accepts the documented product payload and derives a stable identity", () => {
    const product = apliiqProductSchema.parse({
      store_ProductId: null,
      name: "Heavyweight Tee",
      currency: "USD",
      variants: [
        { sku: "APQ-2", price: 32, color: "Black", size: "M" },
        { sku: "APQ-1", price: 32, color: "Black", size: "S" },
      ],
    });
    const reversed = { ...product, variants: [...product.variants].reverse() };
    expect(apliiqExternalProductId(product)).toBe(apliiqExternalProductId(reversed));
    expect(shopSlug("Heavyweight Tee™ / Black")).toBe("heavyweight-tee-black");
  });

  it("converts weights and restricts remote image ingestion to Apliiq storage", () => {
    expect(apliiqWeightGrams(11.9, "oz")).toBe(337);
    expect(isAllowedApliiqImageUrl("https://blob.apliiq.com/path/image.jpg")).toBe(true);
    expect(isAllowedApliiqImageUrl("https://example.com/path/image.jpg")).toBe(false);
    expect(isAllowedApliiqImageUrl("http://blob.apliiq.com/path/image.jpg")).toBe(false);
  });
});
