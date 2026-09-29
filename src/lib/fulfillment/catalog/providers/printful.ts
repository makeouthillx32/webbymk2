import "server-only";

import { mapWithConcurrency, nonEmptyText, moneyToCents, uniqueHttpsUrls, vendorFetchJson } from "../http";
import type { CatalogPage, CatalogProviderAdapter, NormalizedCatalogProduct } from "../types";

type PrintfulListProduct = {
  id: number | string;
  external_id?: string | null;
  name?: string | null;
  thumbnail_url?: string | null;
  is_ignored?: boolean;
};

type PrintfulVariant = {
  id: number | string;
  external_id?: string | null;
  name?: string | null;
  synced?: boolean;
  is_ignored?: boolean;
  variant_id?: number | string | null;
  retail_price?: string | number | null;
  currency?: string | null;
  sku?: string | null;
  availability_status?: string | null;
  product?: { image?: string | null; name?: string | null } | null;
  files?: Array<{ preview_url?: string | null; thumbnail_url?: string | null; url?: string | null }>;
  options?: Array<{ id?: string | null; value?: unknown }>;
};

type PrintfulDetail = {
  result?: {
    sync_product?: PrintfulListProduct;
    sync_variants?: PrintfulVariant[];
  };
};

type PrintfulTemplate = {
  id: number | string;
  product_id: number | string;
  external_product_id?: string | null;
  title?: string | null;
  available_variant_ids?: Array<number | string>;
  option_data?: unknown[];
  colors?: unknown[];
  sizes?: string[];
  mockup_file_url?: string | null;
  placements?: unknown[];
  placement_option_data?: unknown[];
  design_id?: number | string | null;
  created_at?: number | string | null;
  updated_at?: number | string | null;
};

type PrintfulCatalogVariant = {
  id: number | string;
  product_id?: number | string;
  name?: string | null;
  size?: string | null;
  color?: string | null;
  image?: string | null;
  price?: string | number | null;
  in_stock?: boolean;
  material?: unknown;
};

type PrintfulCatalogProduct = {
  result?: {
    product?: {
      id?: number | string;
      title?: string | null;
      description?: string | null;
      currency?: string | null;
      image?: string | null;
    };
    variants?: PrintfulCatalogVariant[];
  };
};

function printfulTimestamp(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Saved designs live in Printful's Product Templates API. They are not
 * returned by /store/products until a merchant explicitly publishes them to
 * a Printful store, so Shop treats a template as its own draft product source.
 */
export function normalizePrintfulTemplate(
  template: PrintfulTemplate,
  catalog: PrintfulCatalogProduct,
): NormalizedCatalogProduct {
  if (!template.id || !template.product_id) {
    throw new Error("Printful product template is missing its id or catalog product id");
  }

  const availableIds = new Set((template.available_variant_ids ?? []).map(String));
  if (!availableIds.size) {
    throw new Error(`Printful product template ${template.id} has no selected variants`);
  }
  const catalogVariants = catalog.result?.variants ?? [];
  const selectedVariants = catalogVariants.filter((variant) => availableIds.has(String(variant.id)));
  if (!selectedVariants.length) {
    throw new Error(`Printful product template ${template.id} variants were not found in the catalog`);
  }

  const currency = nonEmptyText(catalog.result?.product?.currency)?.toUpperCase() ?? "USD";
  const sourceUpdatedAt = printfulTimestamp(template.updated_at);
  const title = nonEmptyText(template.title)
    ?? nonEmptyText(catalog.result?.product?.title)
    ?? `Printful template ${template.id}`;
  const selectedColors = [...new Set(selectedVariants
    .map((variant) => nonEmptyText(variant.color))
    .filter((color): color is string => Boolean(color)))];
  const mockupUrl = nonEmptyText(template.mockup_file_url);
  // Seed the complete garment matrix so Shop can prepare merchandising,
  // pricing, and color-tagged imagery before every combination is enabled in
  // Printful. Only IDs explicitly advertised by the saved template are active
  // and therefore shopper/order eligible.
  const normalizedVariants = catalogVariants.map((variant, index) => {
    const catalogVariantId = String(variant.id);
    const templateAvailable = availableIds.has(catalogVariantId);
    return {
      externalVariantId: `template:${template.id}:variant:${catalogVariantId}`,
      externalSku: `printful-template-${template.id}-${catalogVariantId}`,
      title: nonEmptyText(variant.name)
        ?? [nonEmptyText(variant.color), nonEmptyText(variant.size)].filter(Boolean).join(" / ")
        ?? `Variant ${index + 1}`,
      currency,
      // Template APIs do not define the merchant's retail price. Shop keeps
      // that editorial decision local while retaining Printful's base price
      // as cost data for a preliminary margin preview.
      suggestedRetailCents: null,
      providerCostCents: moneyToCents(variant.price),
      providerCostCurrency: moneyToCents(variant.price) == null ? null : currency,
      active: templateAvailable && variant.in_stock !== false,
      weightGrams: null,
      options: {
        provider: "printful",
        provider_source: "product_template",
        product_template_id: String(template.id),
        catalog_product_id: String(template.product_id),
        catalog_variant_id: catalogVariantId,
        design_id: template.design_id == null ? null : String(template.design_id),
        size: variant.size ?? null,
        color: variant.color ?? null,
        placements: template.placements ?? [],
        option_data: template.option_data ?? [],
        placement_option_data: template.placement_option_data ?? [],
      },
      imageUrls: uniqueHttpsUrls([template.mockup_file_url, variant.image]),
      sourceUpdatedAt,
      raw: {
        template_id: template.id,
        template_available: templateAvailable,
        catalog_variant: variant,
      },
    };
  });

  return {
    externalProductId: `template:${template.id}`,
    externalSavedDesignId: nonEmptyText(template.external_product_id) ?? String(template.id),
    title,
    description: nonEmptyText(catalog.result?.product?.description),
    currency,
    suggestedRetailCents: null,
    // A product template's mockup contains the merchant artwork. Catalog and
    // variant images are blank garments, so importing them would make Shop
    // appear to sell undecorated shirts.
    imageUrls: uniqueHttpsUrls([mockupUrl]),
    imageAltByUrl: mockupUrl && selectedColors.length === 1
      ? { [mockupUrl]: `${title} - ${selectedColors[0]}` }
      : undefined,
    variants: normalizedVariants,
    sourceUpdatedAt,
    raw: { template, catalog_product: catalog.result?.product ?? null },
  };
}

function printfulOptions(variant: PrintfulVariant) {
  const values: Record<string, unknown> = {
    provider: "printful",
    provider_variant_id: String(variant.id),
    catalog_variant_id: variant.variant_id == null ? null : String(variant.variant_id),
    availability_status: variant.availability_status ?? null,
  };
  for (const option of variant.options ?? []) {
    if (option.id) values[option.id] = option.value ?? null;
  }
  return values;
}

export function normalizePrintfulProduct(detail: PrintfulDetail): NormalizedCatalogProduct {
  const product = detail.result?.sync_product;
  if (!product?.id) throw new Error("Printful product response is missing its id");
  const variants = detail.result?.sync_variants ?? [];
  if (!variants.length) throw new Error(`Printful product ${product.id} has no variants`);

  const normalizedVariants = variants.map((variant, index) => {
    const externalVariantId = String(variant.id);
    const currency = nonEmptyText(variant.currency)?.toUpperCase() ?? "USD";
    return {
      externalVariantId,
      externalSku: nonEmptyText(variant.sku) ?? `printful-${externalVariantId}`,
      title: nonEmptyText(variant.name) ?? nonEmptyText(variant.product?.name) ?? `Variant ${index + 1}`,
      currency,
      suggestedRetailCents: moneyToCents(variant.retail_price),
      providerCostCents: null,
      providerCostCurrency: null,
      active: variant.synced !== false && variant.is_ignored !== true && !["discontinued", "out_of_stock", "temporary_out_of_stock"].includes(variant.availability_status ?? ""),
      weightGrams: null,
      options: printfulOptions(variant),
      imageUrls: uniqueHttpsUrls([
        variant.product?.image,
        ...(variant.files ?? []).flatMap((file) => [file.preview_url, file.thumbnail_url]),
      ]),
      sourceUpdatedAt: null,
      raw: variant,
    };
  });
  const retail = normalizedVariants.map((variant) => variant.suggestedRetailCents).filter((value): value is number => value != null);

  return {
    externalProductId: String(product.id),
    externalSavedDesignId: nonEmptyText(product.external_id),
    title: nonEmptyText(product.name) ?? `Printful product ${product.id}`,
    description: null,
    currency: normalizedVariants[0]?.currency ?? "USD",
    suggestedRetailCents: retail.length ? Math.min(...retail) : null,
    imageUrls: uniqueHttpsUrls([
      product.thumbnail_url,
      ...normalizedVariants.flatMap((variant) => variant.imageUrls),
    ]),
    variants: normalizedVariants,
    sourceUpdatedAt: null,
    raw: detail.result,
  };
}

export class PrintfulCatalogAdapter implements CatalogProviderAdapter {
  readonly key = "printful" as const;
  readonly label = "Printful";
  private readonly token = process.env.PRINTFUL_ACCESS_KEY
    || process.env.PRINTFUL_PRIVATE_TOKEN
    || process.env.PRINTFUL_API_TOKEN
    || "";
  readonly missingConfiguration = this.token ? [] : ["PRINTFUL_ACCESS_KEY"];
  readonly configured = this.missingConfiguration.length === 0;

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  async listPage(cursor?: string | null): Promise<CatalogPage> {
    if (!this.configured) throw new Error(`Printful is missing ${this.missingConfiguration.join(", ")}`);
    const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
    const limit = 50;
    const list = await vendorFetchJson<{
      result?: { items?: PrintfulTemplate[] };
      paging?: { total?: number; offset?: number; limit?: number };
    }>(`https://api.printful.com/product-templates?offset=${offset}&limit=${limit}`, {
      headers: this.headers(),
    });
    if (!Array.isArray(list.result?.items)) {
      throw new Error("Printful product template list response is malformed");
    }
    const templates = list.result.items;
    const products = await mapWithConcurrency(templates, 5, async (template): Promise<NormalizedCatalogProduct> => {
      const catalog = await vendorFetchJson<PrintfulCatalogProduct>(
        `https://api.printful.com/products/${encodeURIComponent(String(template.product_id))}`,
        { headers: this.headers() },
      );
      return normalizePrintfulTemplate(template, catalog);
    });
    const consumed = offset + templates.length;
    const total = list.paging?.total ?? consumed;
    return { products, nextCursor: consumed < total ? String(consumed) : null };
  }
}
