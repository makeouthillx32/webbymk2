import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type VariantRow = {
  id: string;
  options: unknown;
  is_active?: boolean | null;
  allow_backorder?: boolean | null;
};

type MappingRow = {
  variant_id: string;
  active: boolean | null;
};

type ImageRow = {
  alt_text: string | null;
  is_public?: boolean | null;
};

function chunks<T>(values: T[], size = 75) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export type ProviderColorReadiness = {
  color: string;
  variantCount: number;
  vendorEnabled: boolean;
  hasArtwork: boolean;
  ready: boolean;
};

export type ProviderArtworkReadiness = {
  managed: boolean;
  colors: ProviderColorReadiness[];
  missingArtworkColors: string[];
  awaitingVendorColors: string[];
  readyColors: string[];
};

function colorFromOptions(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return null;
  const color = (options as Record<string, unknown>).color;
  if (typeof color === "string") return color.trim() || null;
  if (color && typeof color === "object" && !Array.isArray(color)) {
    const name = (color as Record<string, unknown>).name;
    return typeof name === "string" ? name.trim() || null : null;
  }
  return null;
}

function searchable(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasColorArtwork(images: ImageRow[], color: string) {
  const needle = searchable(color);
  return Boolean(needle) && images.some((image) => {
    if (image.is_public === false) return false;
    const haystack = searchable(image.alt_text);
    // The dashboard seeds an exact color tag, while provider mockups use a
    // human-friendly "Product title - Color" suffix. Avoid broad substring
    // matching so artwork for "Black Heather" cannot unlock plain "Black".
    return haystack === needle || haystack.endsWith(` ${needle}`);
  });
}

export function buildProviderArtworkReadiness(
  variants: VariantRow[],
  mappings: MappingRow[],
  images: ImageRow[],
): ProviderArtworkReadiness {
  const mappingByVariant = new Map(mappings.map((mapping) => [String(mapping.variant_id), mapping]));
  const colors = new Map<string, ProviderColorReadiness>();

  for (const variant of variants) {
    const mapping = mappingByVariant.get(String(variant.id));
    if (!mapping) continue;
    const color = colorFromOptions(variant.options);
    if (!color) continue;
    const key = searchable(color);
    const existing = colors.get(key) ?? {
      color,
      variantCount: 0,
      vendorEnabled: false,
      hasArtwork: hasColorArtwork(images, color),
      ready: false,
    };
    existing.variantCount += 1;
    existing.vendorEnabled ||= mapping.active === true;
    existing.ready = existing.vendorEnabled && existing.hasArtwork;
    colors.set(key, existing);
  }

  const rows = [...colors.values()].sort((a, b) => a.color.localeCompare(b.color));
  return {
    managed: mappings.length > 0,
    colors: rows,
    missingArtworkColors: rows.filter((row) => !row.hasArtwork).map((row) => row.color),
    awaitingVendorColors: rows.filter((row) => row.hasArtwork && !row.vendorEnabled).map((row) => row.color),
    readyColors: rows.filter((row) => row.ready).map((row) => row.color),
  };
}

export async function getProviderArtworkReadiness(admin: AdminClient, productId: string) {
  const [variantResult, mappingResult, imageResult] = await Promise.all([
    admin.from("product_variants").select("id, options, is_active, allow_backorder").eq("product_id", productId),
    admin.from("provider_variant_mappings").select("variant_id, active").eq("product_id", productId),
    admin.from("product_images").select("alt_text, is_public").eq("product_id", productId),
  ]);
  const error = variantResult.error ?? mappingResult.error ?? imageResult.error;
  if (error) throw new Error(error.message);
  return buildProviderArtworkReadiness(
    (variantResult.data ?? []) as VariantRow[],
    (mappingResult.data ?? []) as MappingRow[],
    (imageResult.data ?? []) as ImageRow[],
  );
}

export async function reconcileProviderArtworkVariants(admin: AdminClient, productId: string) {
  const [variantResult, mappingResult, imageResult] = await Promise.all([
    admin.from("product_variants").select("id, options, is_active, allow_backorder").eq("product_id", productId),
    admin.from("provider_variant_mappings").select("variant_id, active").eq("product_id", productId),
    admin.from("product_images").select("alt_text, is_public").eq("product_id", productId),
  ]);
  const error = variantResult.error ?? mappingResult.error ?? imageResult.error;
  if (error) throw new Error(error.message);

  const variants = (variantResult.data ?? []) as VariantRow[];
  const mappings = (mappingResult.data ?? []) as MappingRow[];
  const images = (imageResult.data ?? []) as ImageRow[];
  if (!mappings.length) return buildProviderArtworkReadiness(variants, mappings, images);

  const mappingByVariant = new Map(mappings.map((mapping) => [String(mapping.variant_id), mapping]));
  const activate: string[] = [];
  const deactivate: string[] = [];
  for (const variant of variants) {
    const mapping = mappingByVariant.get(String(variant.id));
    if (!mapping) continue;
    const color = colorFromOptions(variant.options);
    const shouldBeActive = mapping.active === true && (!color || hasColorArtwork(images, color));
    (shouldBeActive ? activate : deactivate).push(String(variant.id));
  }

  const now = new Date().toISOString();
  for (const [ids, value] of [[activate, true], [deactivate, false]] as const) {
    if (!ids.length) continue;
    // PostgREST encodes `.in(...)` values into the request URL. Large apparel
    // matrices can contain hundreds of UUIDs, so bound each request rather
    // than overflowing the proxy/request-line limit.
    for (const idChunk of chunks(ids)) {
      const variantUpdate = await admin
        .from("product_variants")
        .update({ is_active: value, allow_backorder: value, updated_at: now })
        .in("id", idChunk);
      if (variantUpdate.error) throw new Error(variantUpdate.error.message);
      const inventoryUpdate = await admin
        .from("inventory")
        .update({ allow_backorder: value, updated_at: now })
        .in("variant_id", idChunk);
      if (inventoryUpdate.error) throw new Error(inventoryUpdate.error.message);
    }
  }

  return buildProviderArtworkReadiness(variants, mappings, images);
}
