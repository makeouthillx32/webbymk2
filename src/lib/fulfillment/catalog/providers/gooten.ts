import "server-only";

import { mapWithConcurrency, nonEmptyText, uniqueHttpsUrls, vendorFetchJson } from "../http";
import type { CatalogPage, CatalogProviderAdapter, NormalizedCatalogProduct } from "../types";

type GootenProduct = {
  ProductName?: string | null;
  NumberOfVariants?: number | null;
};

type GootenVariant = {
  ProductName?: string | null;
  Sku?: string | null;
  Name?: string | null;
  ImageUrl?: string | null;
};

type GootenPage<T> = {
  PageCount?: number;
  Page?: number;
  Products?: T[];
  Variants?: T[];
  HadError?: boolean;
  Errors?: Array<{ ErrorMessage?: string | null }>;
};

function assertGootenResponse<T>(response: GootenPage<T>, field: "Products" | "Variants") {
  if (response.HadError) {
    const detail = response.Errors?.map((error) => nonEmptyText(error.ErrorMessage)).filter(Boolean).join("; ");
    throw new Error(detail || `Gooten ${field.toLowerCase()} request failed`);
  }
  const value = response[field];
  if (!Array.isArray(value)) throw new Error(`Gooten ${field.toLowerCase()} response is malformed`);
  return value;
}

export function normalizeGootenProduct(product: GootenProduct, variants: GootenVariant[]): NormalizedCatalogProduct {
  const productName = nonEmptyText(product.ProductName);
  if (!productName) throw new Error("Gooten PRP response is missing ProductName");
  if (!variants.length) throw new Error(`Gooten PRP ${productName} has no variants`);

  const normalizedVariants = variants.map((variant, index) => {
    const sku = nonEmptyText(variant.Sku);
    if (!sku) throw new Error(`Gooten PRP ${productName} variant ${index + 1} is missing Sku`);
    const imageUrls = uniqueHttpsUrls([variant.ImageUrl]);
    return {
      externalVariantId: sku,
      externalSku: sku,
      title: nonEmptyText(variant.Name) ?? sku,
      currency: "USD",
      suggestedRetailCents: null,
      providerCostCents: null,
      providerCostCurrency: null,
      active: true,
      weightGrams: null,
      options: {
        provider: "gooten",
        provider_sku: sku,
        prp_product_name: nonEmptyText(variant.ProductName) ?? productName,
      },
      imageUrls,
      sourceUpdatedAt: null,
      raw: variant,
    };
  });

  return {
    externalProductId: productName,
    externalSavedDesignId: productName,
    title: productName,
    description: null,
    currency: "USD",
    suggestedRetailCents: null,
    imageUrls: uniqueHttpsUrls(normalizedVariants.flatMap((variant) => variant.imageUrls)),
    variants: normalizedVariants,
    sourceUpdatedAt: null,
    raw: { product, variants },
  };
}

export class GootenCatalogAdapter implements CatalogProviderAdapter {
  readonly key = "gooten" as const;
  readonly label = "Gooten";
  private readonly recipeId = process.env.GOOTEN_RECIPE_ID || "";
  readonly missingConfiguration = this.recipeId ? [] : ["GOOTEN_RECIPE_ID"];
  readonly configured = this.missingConfiguration.length === 0;

  private url(path: "prpproducts" | "prpvariants", page: number, productName?: string) {
    const url = new URL(`https://api.print.io/api/v/5/source/api/${path}/`);
    url.searchParams.set("recipeid", this.recipeId);
    url.searchParams.set("page", String(page));
    if (productName) url.searchParams.set("productName", productName);
    return url.toString();
  }

  private async variantsFor(productName: string) {
    const variants: GootenVariant[] = [];
    let page = 1;
    let pageCount = 1;
    do {
      const response = await vendorFetchJson<GootenPage<GootenVariant>>(this.url("prpvariants", page, productName), {});
      variants.push(...assertGootenResponse(response, "Variants"));
      pageCount = Math.max(1, Number(response.PageCount) || 1);
      page += 1;
    } while (page <= pageCount);
    return variants;
  }

  async listPage(cursor?: string | null): Promise<CatalogPage> {
    if (!this.configured) throw new Error(`Gooten is missing ${this.missingConfiguration.join(", ")}`);
    const page = Math.max(1, Number.parseInt(cursor ?? "1", 10) || 1);
    const response = await vendorFetchJson<GootenPage<GootenProduct>>(this.url("prpproducts", page), {});
    const summaries = assertGootenResponse(response, "Products");
    const products = await mapWithConcurrency(summaries, 4, async (summary): Promise<NormalizedCatalogProduct> => {
      const productName = nonEmptyText(summary.ProductName);
      if (!productName) throw new Error("Gooten PRP product is missing ProductName");
      return normalizeGootenProduct(summary, await this.variantsFor(productName));
    });
    const pageCount = Math.max(1, Number(response.PageCount) || 1);
    return { products, nextCursor: page < pageCount ? String(page + 1) : null };
  }
}
