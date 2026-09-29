import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { mapWithConcurrency, moneyToCents, uniqueHttpsUrls } = await import("./http");
const { normalizeGelatoProduct } = await import("./providers/gelato");
const { normalizeGootenProduct } = await import("./providers/gooten");
const { normalizePrintfulProduct, normalizePrintfulTemplate } = await import("./providers/printful");
const { buildProviderArtworkReadiness } = await import("./artwork-readiness");

describe("catalog normalization", () => {
  test("normalizes a saved Printful product without confusing retail price for vendor cost", () => {
    const product = normalizePrintfulProduct({
      result: {
        sync_product: { id: 42, external_id: "design-42", name: "Night Shirt", thumbnail_url: "https://files.cdn.printful.com/night.png" },
        sync_variants: [{
          id: 4201,
          name: "Night Shirt - Black / XL",
          retail_price: "40.00",
          currency: "usd",
          sku: "NIGHT-BLK-XL",
          synced: true,
          is_ignored: false,
          availability_status: "active",
          product: { image: "https://files.cdn.printful.com/night-xl.png" },
        }],
      },
    });

    expect(product.externalProductId).toBe("42");
    expect(product.externalSavedDesignId).toBe("design-42");
    expect(product.suggestedRetailCents).toBe(4000);
    expect(product.variants[0].providerCostCents).toBeNull();
    expect(product.variants[0].active).toBe(true);
    expect(product.variants[0].externalSku).toBe("NIGHT-BLK-XL");
  });

  test("marks unavailable Printful variants inactive", () => {
    const product = normalizePrintfulProduct({
      result: {
        sync_product: { id: 8, name: "Archived Tee" },
        sync_variants: [{ id: 9, availability_status: "out_of_stock", synced: true }],
      },
    });
    expect(product.variants[0].active).toBe(false);
  });

  test("seeds the full Printful garment matrix but only activates template-approved variants", () => {
    const product = normalizePrintfulTemplate({
      id: 107293625,
      product_id: 162,
      title: "Short sleeve t-shirt",
      available_variant_ids: [6585],
      mockup_file_url: "https://files.cdn.printful.com/mockup.png",
      placements: [{ placement: "front", technique_key: "DTG" }],
      design_id: 1234,
      updated_at: 1789008059,
    }, {
      result: {
        product: {
          id: 162,
          title: "Unisex Triblend T-Shirt",
          description: "A soft triblend tee.",
          currency: "USD",
          image: "https://files.cdn.printful.com/catalog.png",
        },
        variants: [
          { id: 6585, name: "Solid Black Triblend / S", size: "S", color: "Solid Black Triblend", price: "18.31", in_stock: true, image: "https://files.cdn.printful.com/black-s.png" },
          { id: 6586, name: "Solid Black Triblend / M", size: "M", color: "Solid Black Triblend", price: "18.31", in_stock: true, image: "https://files.cdn.printful.com/black-m.png" },
          { id: 6590, name: "White Triblend / S", size: "S", color: "White Triblend", price: "18.31", in_stock: true, image: "https://files.cdn.printful.com/white-s.png" },
        ],
      },
    });

    expect(product.externalProductId).toBe("template:107293625");
    expect(product.externalSavedDesignId).toBe("107293625");
    expect(product.title).toBe("Short sleeve t-shirt");
    expect(product.suggestedRetailCents).toBeNull();
    expect(product.imageUrls[0]).toBe("https://files.cdn.printful.com/mockup.png");
    expect(product.imageUrls).toHaveLength(1);
    expect(product.imageUrls).not.toContain("https://files.cdn.printful.com/catalog.png");
    expect(product.imageUrls).not.toContain("https://files.cdn.printful.com/black-s.png");
    expect(product.imageAltByUrl).toEqual({
      "https://files.cdn.printful.com/mockup.png": "Short sleeve t-shirt - Solid Black Triblend",
    });
    expect(product.variants).toHaveLength(3);
    expect(product.variants[0].providerCostCents).toBe(1831);
    expect(product.variants[0].active).toBe(true);
    expect(product.variants[0].options.product_template_id).toBe("107293625");
    expect(product.variants[0].options.catalog_variant_id).toBe("6585");
    expect(product.variants[0].raw).toMatchObject({ template_available: true });
    expect(product.variants[1].options.size).toBe("M");
    expect(product.variants[1].active).toBe(false);
    expect(product.variants[1].raw).toMatchObject({ template_available: false });
    expect(product.variants[2].options.color).toBe("White Triblend");
    expect(product.variants[2].active).toBe(false);
    expect(product.imageUrls).not.toContain("https://files.cdn.printful.com/white-s.png");
  });

  test("requires both vendor availability and a color-tagged artwork mockup", () => {
    const variants = [
      { id: "black-s", options: { color: "Black", size: "S" } },
      { id: "yellow-s", options: { color: "Yellow", size: "S" } },
      { id: "navy-s", options: { color: "Navy", size: "S" } },
    ];
    const mappings = [
      { variant_id: "black-s", active: true },
      { variant_id: "yellow-s", active: true },
      { variant_id: "navy-s", active: false },
    ];
    const readiness = buildProviderArtworkReadiness(variants, mappings, [
      { alt_text: "Finished front artwork - Black Heather", is_public: true },
      { alt_text: "Finished front artwork - Black", is_public: true },
      { alt_text: "Navy", is_public: true },
    ]);

    expect(readiness.readyColors).toEqual(["Black"]);
    expect(readiness.missingArtworkColors).toEqual(["Yellow"]);
    expect(readiness.awaitingVendorColors).toEqual(["Navy"]);
  });

  test("normalizes Gelato store products and preserves provider identifiers", () => {
    const product = normalizeGelatoProduct({
      id: "gel-product",
      externalId: "saved-product",
      title: "Crewneck",
      status: "active",
      updatedAt: "2026-09-09T12:00:00Z",
      previewUrl: "https://gelato-api-test.s3.eu-west-1.amazonaws.com/preview.png",
      productVariantOptions: [
        { name: "Color", values: ["White", "Navy"] },
        { name: "Size", values: ["S", "M"] },
      ],
      variants: [{
        id: "gel-variant",
        externalId: "external-variant",
        title: "Navy - M",
        connectionStatus: "connected",
        productUid: "apparel_product_navy_m",
      }],
    });

    expect(product.externalProductId).toBe("gel-product");
    expect(product.externalSavedDesignId).toBe("saved-product");
    expect(product.suggestedRetailCents).toBeNull();
    expect(product.variants[0].options.color).toBe("Navy");
    expect(product.variants[0].options.size).toBe("M");
    expect(product.variants[0].active).toBe(true);
  });

  test("normalizes Gooten print-ready products into orderable draft variants", () => {
    const product = normalizeGootenProduct(
      { ProductName: "Signal Tee", NumberOfVariants: 2 },
      [
        { ProductName: "Signal Tee", Sku: "SIGNAL-BLACK-M", Name: "Black / M", ImageUrl: "https://appassets.azureedge.net/signal-m.png" },
        { ProductName: "Signal Tee", Sku: "SIGNAL-BLACK-L", Name: "Black / L", ImageUrl: "https://appassets.azureedge.net/signal-l.png" },
      ],
    );

    expect(product.externalProductId).toBe("Signal Tee");
    expect(product.variants).toHaveLength(2);
    expect(product.variants[0].externalVariantId).toBe("SIGNAL-BLACK-M");
    expect(product.variants[0].suggestedRetailCents).toBeNull();
    expect(product.imageUrls).toHaveLength(2);
  });

  test("rejects malformed money and filters non-HTTPS media", () => {
    expect(moneyToCents("19.28")).toBe(1928);
    expect(moneyToCents("not-money")).toBeNull();
    expect(uniqueHttpsUrls(["http://bad.test/x.png", "https://good.test/x.png", "nope"]))
      .toEqual(["https://good.test/x.png"]);
  });

  test("bounds vendor detail concurrency without changing product order", async () => {
    let active = 0;
    let peak = 0;
    const values = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      active -= 1;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });
});
