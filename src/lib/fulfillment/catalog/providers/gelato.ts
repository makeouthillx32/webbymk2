import "server-only";

import { nonEmptyText, uniqueHttpsUrls, vendorFetchJson } from "../http";
import type { CatalogPage, CatalogProviderAdapter, NormalizedCatalogProduct } from "../types";

type GelatoVariant = {
  id: string;
  productId?: string | null;
  title?: string | null;
  externalId?: string | null;
  connectionStatus?: string | null;
  productUid?: string | null;
};

type GelatoProduct = {
  id: string;
  storeId?: string | null;
  externalId?: string | null;
  title?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  externalPreviewUrl?: string | null;
  externalThumbnailUrl?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  variants?: GelatoVariant[];
  productVariantOptions?: Array<{ name?: string | null; values?: string[] }>;
};

function validTimestamp(value: unknown) {
  const text = nonEmptyText(value);
  if (!text) return null;
  return Number.isNaN(Date.parse(text)) ? null : new Date(text).toISOString();
}

function inferGelatoOptions(product: GelatoProduct, variant: GelatoVariant) {
  const options: Record<string, unknown> = {
    provider: "gelato",
    provider_variant_id: variant.id,
    product_uid: variant.productUid ?? null,
    connection_status: variant.connectionStatus ?? null,
  };
  const title = variant.title ?? "";
  for (const definition of product.productVariantOptions ?? []) {
    const name = nonEmptyText(definition.name);
    if (!name) continue;
    const match = (definition.values ?? [])
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .find((value) => title.toLowerCase().includes(value.toLowerCase()));
    if (match) options[name.toLowerCase()] = match;
  }
  return options;
}

export function normalizeGelatoProduct(product: GelatoProduct): NormalizedCatalogProduct {
  if (!product.id) throw new Error("Gelato product response is missing its id");
  const variants = product.variants ?? [];
  if (!variants.length) throw new Error(`Gelato product ${product.id} has no variants`);
  const imageUrls = uniqueHttpsUrls([
    product.previewUrl,
    product.externalPreviewUrl,
    product.externalThumbnailUrl,
  ]);

  const sourceUpdatedAt = validTimestamp(product.updatedAt);
  return {
    externalProductId: product.id,
    externalSavedDesignId: nonEmptyText(product.externalId),
    title: nonEmptyText(product.title) ?? `Gelato product ${product.id}`,
    description: nonEmptyText(product.description),
    currency: "USD",
    suggestedRetailCents: null,
    imageUrls,
    variants: variants.map((variant, index) => ({
      externalVariantId: variant.id,
      externalSku: nonEmptyText(variant.externalId) ?? `gelato-${variant.id}`,
      title: nonEmptyText(variant.title) ?? `Variant ${index + 1}`,
      currency: "USD",
      suggestedRetailCents: null,
      providerCostCents: null,
      providerCostCurrency: null,
      active: variant.connectionStatus === "connected",
      weightGrams: null,
      options: inferGelatoOptions(product, variant),
      imageUrls,
      sourceUpdatedAt,
      raw: variant,
    })),
    sourceUpdatedAt,
    raw: product,
  };
}

export class GelatoCatalogAdapter implements CatalogProviderAdapter {
  readonly key = "gelato" as const;
  readonly label = "Gelato";
  private readonly apiKey = process.env.GELATO_API_KEY || "";
  private readonly storeId = process.env.GELATO_STORE_ID || "";
  readonly missingConfiguration = [
    ...(!this.apiKey ? ["GELATO_API_KEY"] : []),
    ...(!this.storeId ? ["GELATO_STORE_ID"] : []),
  ];
  readonly configured = this.missingConfiguration.length === 0;

  async listPage(cursor?: string | null): Promise<CatalogPage> {
    if (!this.configured) throw new Error(`Gelato is missing ${this.missingConfiguration.join(", ")}`);
    const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
    const limit = 100;
    const url = new URL(`https://ecommerce.gelatoapis.com/v1/stores/${encodeURIComponent(this.storeId)}/products`);
    url.searchParams.set("order", "asc");
    url.searchParams.set("orderBy", "updatedAt");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    const response = await vendorFetchJson<{ products?: GelatoProduct[] }>(url.toString(), {
      headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
    });
    if (!Array.isArray(response.products)) {
      throw new Error("Gelato product list response is malformed");
    }
    const products = response.products;
    return {
      products: products.map(normalizeGelatoProduct),
      nextCursor: products.length === limit ? String(offset + products.length) : null,
    };
  }
}
