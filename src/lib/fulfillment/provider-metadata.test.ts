import { describe, expect, test } from "bun:test";
import {
  fulfillmentProviderFromOptions,
  fulfillmentProviderFromTags,
  fulfillmentProviderLabel,
  shopperVariantOptions,
} from "./provider-metadata";

describe("fulfillment provider metadata", () => {
  test("reads provider tags used by imported Shop products", () => {
    expect(fulfillmentProviderFromTags(["featured", "provider:apliiq"])).toBe("apliiq");
    expect(fulfillmentProviderFromTags(null)).toBeNull();
  });

  test("reads provider ownership from variant options", () => {
    expect(fulfillmentProviderFromOptions({ size: "L", provider: "Printful" })).toBe("printful");
    expect(fulfillmentProviderFromOptions(["provider", "apliiq"])).toBeNull();
  });

  test("formats known and future providers", () => {
    expect(fulfillmentProviderLabel("gelato")).toBe("Gelato");
    expect(fulfillmentProviderLabel("local-maker")).toBe("Local-maker");
    expect(fulfillmentProviderLabel(null)).toBe("Local inventory");
  });

  test("keeps shopper choices while stripping provider plumbing", () => {
    expect(shopperVariantOptions({
      color: "Black",
      size: "S",
      provider: "printful",
      provider_variant_id: "template:1:variant:2",
      product_template_id: "1",
      placements: [{ placement: "front" }],
      option_data: [],
      design_id: null,
    })).toEqual({ color: "Black", size: "S" });
  });
});
