const PROVIDER_LABELS: Record<string, string> = {
  apliiq: "Apliiq",
  fourthwall: "Fourthwall",
  gelato: "Gelato",
  gooten: "Gooten",
  printful: "Printful",
};

const NON_SELECTABLE_OPTION_KEYS = new Set([
  "material",
  "made_in",
  "dimensions",
  "weight",
  "provider",
  "provider_source",
  "provider_sku",
  "provider_image_url",
  "product_uid",
  "connection_status",
  "design_id",
  "placements",
  "option_data",
  "placement_option_data",
]);

/** Keep fulfillment plumbing out of shopper-facing variant selectors. */
export function isShopperVariantOption(key: string, value: unknown): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized || NON_SELECTABLE_OPTION_KEYS.has(normalized)) return false;
  if (/^(provider|catalog|external|product_template|placement|prp)_/.test(normalized)) return false;
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return false;
  if (typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" && name.trim().length > 0;
  }
  return ["string", "number", "boolean"].includes(typeof value);
}

export function shopperVariantOptions(options: unknown): Record<string, unknown> {
  if (!options || typeof options !== "object" || Array.isArray(options)) return {};
  return Object.fromEntries(
    Object.entries(options as Record<string, unknown>)
      .filter(([key, value]) => isShopperVariantOption(key, value)),
  );
}

export function fulfillmentProviderFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const providerTag = tags.find(
    (tag): tag is string => typeof tag === "string" && tag.startsWith("provider:"),
  );
  return providerTag?.slice("provider:".length).trim().toLowerCase() || null;
}

export function fulfillmentProviderFromOptions(options: unknown): string | null {
  if (!options || typeof options !== "object" || Array.isArray(options)) return null;
  const provider = (options as Record<string, unknown>).provider;
  return typeof provider === "string" && provider.trim()
    ? provider.trim().toLowerCase()
    : null;
}

export function fulfillmentProviderLabel(provider: string | null | undefined): string {
  if (!provider) return "Local inventory";
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}
