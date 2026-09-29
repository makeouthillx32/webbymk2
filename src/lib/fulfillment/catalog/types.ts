export type CatalogProviderKey = "printful" | "gelato" | "gooten";
export type CatalogTriggerKind = "manual" | "scheduled" | "webhook";

export type NormalizedCatalogVariant = {
  externalVariantId: string;
  externalSku: string;
  title: string;
  currency: string;
  suggestedRetailCents: number | null;
  providerCostCents: number | null;
  providerCostCurrency: string | null;
  active: boolean;
  weightGrams: number | null;
  options: Record<string, unknown>;
  imageUrls: string[];
  sourceUpdatedAt: string | null;
  raw: unknown;
};

export type NormalizedCatalogProduct = {
  externalProductId: string;
  externalSavedDesignId: string | null;
  title: string;
  description: string | null;
  currency: string;
  suggestedRetailCents: number | null;
  imageUrls: string[];
  imageAltByUrl?: Record<string, string>;
  variants: NormalizedCatalogVariant[];
  sourceUpdatedAt: string | null;
  raw: unknown;
};

export type CatalogPage = {
  products: NormalizedCatalogProduct[];
  nextCursor: string | null;
};

export interface CatalogProviderAdapter {
  readonly key: CatalogProviderKey;
  readonly label: string;
  readonly configured: boolean;
  readonly missingConfiguration: string[];
  listPage(cursor?: string | null): Promise<CatalogPage>;
}

export type CatalogSyncCounts = {
  seen: number;
  created: number;
  updated: number;
  archived: number;
  failed: number;
};

export type CatalogSyncResult = CatalogSyncCounts & {
  runId: string;
  provider: CatalogProviderKey;
  status: "succeeded" | "partial" | "failed";
  errors: string[];
};
