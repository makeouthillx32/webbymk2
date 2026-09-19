import "server-only";

import { createHash } from "node:crypto";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/images";
import { shopSlug } from "@/lib/fulfillment/apliiq";
import { shopperVariantOptions } from "@/lib/fulfillment/provider-metadata";
import { reconcileProviderArtworkVariants } from "./artwork-readiness";
import { createAdminClient } from "@/utils/supabase/admin";
import { createCatalogAdapter } from "./providers";
import type {
  CatalogProviderKey,
  CatalogSyncCounts,
  CatalogSyncResult,
  CatalogTriggerKind,
  NormalizedCatalogProduct,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown catalog synchronization error";
}

function sourceHash(product: NormalizedCatalogProduct) {
  return createHash("sha256").update(JSON.stringify(product.raw)).digest("hex");
}

function importedSlug(provider: CatalogProviderKey, title: string, externalId: string) {
  const suffix = createHash("sha256").update(externalId).digest("hex").slice(0, 8);
  return `${provider}-${shopSlug(title)}-${suffix}`.slice(0, 100);
}

function canonicalImagePath(value: string) {
  const url = new URL(value);
  return `${url.hostname}${url.pathname}`;
}

function isAllowedVendorImage(provider: CatalogProviderKey, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (provider === "printful") {
      return host === "printful.com" || host.endsWith(".printful.com");
    }
    if (provider === "gooten") {
      return host === "appassets.azureedge.net"
        || host === "gtn-imgmanip-v2-cdn.azureedge.net"
        || host.endsWith(".gooten.com");
    }
    return host === "gelato.com"
      || host.endsWith(".gelato.com")
      || host.endsWith(".gelatoapis.com")
      || host.endsWith(".gelato.tech")
      || (host.endsWith(".amazonaws.com") && host.startsWith("gelato-"));
  } catch {
    return false;
  }
}

async function importVendorImages(
  admin: AdminClient,
  input: {
    provider: CatalogProviderKey;
    productId: string;
    externalProductId: string;
    title: string;
    urls: string[];
    altByUrl?: Record<string, string>;
  },
) {
  const errors: string[] = [];
  let imported = 0;
  const urls = [...new Set(input.urls)].slice(0, 10);
  const expectedObjectMarkers = new Set<string>();

  for (const [position, imageUrl] of urls.entries()) {
    if (!isAllowedVendorImage(input.provider, imageUrl)) {
      errors.push(`Skipped untrusted image host at position ${position + 1}`);
      continue;
    }
    try {
      const digest = createHash("sha256")
        .update(`${input.externalProductId}:${canonicalImagePath(imageUrl)}`)
        .digest("hex")
        .slice(0, 24);
      const objectMarker = `${position}-${digest}.`;
      expectedObjectMarkers.add(objectMarker);
      const remote = await fetch(imageUrl, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      if (!remote.ok) throw new Error(`HTTP ${remote.status}`);
      const contentType = remote.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!contentType.startsWith("image/")) throw new Error("response was not an image");
      const declaredSize = Number(remote.headers.get("content-length") ?? 0);
      if (declaredSize > 12 * 1024 * 1024) throw new Error("image exceeded 12 MB");
      const bytes = Buffer.from(await remote.arrayBuffer());
      if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("image exceeded 12 MB");
      const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      const objectPath = `products/${input.productId}/vendors/${input.provider}/${position}-${digest}.${ext}`;
      const upload = await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(objectPath, bytes, {
        upsert: true,
        contentType,
        cacheControl: "86400",
      });
      if (upload.error) throw new Error(upload.error.message);

      const { data: existing, error: lookupError } = await admin
        .from("product_images")
        .select("id, alt_text")
        .eq("product_id", input.productId)
        .eq("bucket_name", PRODUCT_IMAGE_BUCKET)
        .eq("object_path", objectPath)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      const importedAlt = input.altByUrl?.[imageUrl] ?? input.title;
      if (!existing) {
        const { count } = await admin
          .from("product_images")
          .select("id", { count: "exact", head: true })
          .eq("product_id", input.productId);
        const inserted = await admin.from("product_images").insert({
          product_id: input.productId,
          bucket_name: PRODUCT_IMAGE_BUCKET,
          object_path: objectPath,
          alt_text: importedAlt,
          is_public: true,
          is_primary: (count ?? 0) === 0,
          sort_order: position,
          position,
          mime_type: contentType,
          size_bytes: bytes.byteLength,
        });
        if (inserted.error) throw new Error(inserted.error.message);
      } else if (existing.alt_text === input.title && importedAlt !== input.title) {
        const updated = await admin
          .from("product_images")
          .update({ alt_text: importedAlt })
          .eq("id", existing.id);
        if (updated.error) throw new Error(updated.error.message);
      }
      imported += 1;
    } catch (error) {
      errors.push(`Image ${position + 1}: ${errorMessage(error)}`);
    }
  }

  // Reconcile only this provider-owned folder. Merchant uploads live outside
  // it and are never removed by a vendor refresh.
  const providerPrefix = `products/${input.productId}/vendors/${input.provider}/`;
  const { data: providerImages, error: providerImagesError } = await admin
    .from("product_images")
    .select("id, object_path")
    .eq("product_id", input.productId)
    .eq("bucket_name", PRODUCT_IMAGE_BUCKET)
    .like("object_path", `${providerPrefix}%`);
  if (providerImagesError) {
    errors.push(`Could not reconcile prior vendor images: ${providerImagesError.message}`);
  } else {
    const stale = (providerImages ?? []).filter((image) => {
      if (typeof image.object_path !== "string") return false;
      const filename = image.object_path.slice(providerPrefix.length);
      return ![...expectedObjectMarkers].some((marker) => filename.startsWith(marker));
    });
    if (stale.length) {
      const staleIds = stale.map((image) => image.id);
      const stalePaths = stale.map((image) => String(image.object_path));
      const deleted = await admin.from("product_images").delete().in("id", staleIds);
      if (deleted.error) {
        errors.push(`Could not remove stale vendor image records: ${deleted.error.message}`);
      } else {
        const removed = await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove(stalePaths);
        if (removed.error) errors.push(`Could not remove stale vendor image files: ${removed.error.message}`);
      }
    }
  }

  return { imported, errors };
}

async function upsertCatalogProduct(
  admin: AdminClient,
  providerId: string,
  provider: CatalogProviderKey,
  runId: string,
  product: NormalizedCatalogProduct,
) {
  const now = new Date().toISOString();
  const { data: existingMap, error: mappingError } = await admin
    .from("provider_products")
    .select("id, product_id")
    .eq("provider_id", providerId)
    .eq("external_product_id", product.externalProductId)
    .maybeSingle();
  if (mappingError) throw new Error(mappingError.message);

  let productId = existingMap?.product_id ? String(existingMap.product_id) : null;
  const created = !productId;
  if (!productId) {
    const createdProduct = await admin.from("products").insert({
      slug: importedSlug(provider, product.title, product.externalProductId),
      title: product.title,
      description: product.description,
      price_cents: product.suggestedRetailCents ?? 0,
      currency: product.currency,
      brand: provider === "printful" ? "Printful" : provider === "gelato" ? "Gelato" : "Gooten",
      tags: ["dropship", `provider:${provider}`, `${provider}:${product.externalProductId}`],
      status: "draft",
    }).select("id").single();
    if (createdProduct.error || !createdProduct.data?.id) {
      throw new Error(createdProduct.error?.message ?? "Shop product creation failed");
    }
    productId = String(createdProduct.data.id);
  }

  // Existing imports may already have a variant at position 0. When a later
  // provider pull discovers the garment's full matrix, inserting the first
  // newly discovered variant at its catalog index can collide with that row's
  // unique (product_id, position) constraint. Append new rows after the current
  // maximum; existing merchant-visible ordering stays stable across re-syncs.
  const { data: lastPosition, error: lastPositionError } = await admin
    .from("product_variants")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastPositionError) throw new Error(lastPositionError.message);
  let nextAppendPosition = typeof lastPosition?.position === "number"
    ? lastPosition.position + 1
    : 0;

  const seenVariantMappingIds = new Set<string>();
  for (const variant of product.variants) {
    const { data: mappingById, error: existingVariantError } = await admin
      .from("provider_variant_mappings")
      .select("id, variant_id")
      .eq("provider_id", providerId)
      .eq("external_variant_id", variant.externalVariantId)
      .maybeSingle();
    if (existingVariantError) throw new Error(existingVariantError.message);

    let mapping = mappingById;
    if (!mapping) {
      const bySku = await admin
        .from("provider_variant_mappings")
        .select("id, variant_id")
        .eq("provider_id", providerId)
        .eq("external_sku", variant.externalSku)
        .maybeSingle();
      if (bySku.error) throw new Error(bySku.error.message);
      mapping = bySku.data;
    }

    let variantId = mapping?.variant_id ? String(mapping.variant_id) : null;
    if (mapping?.id) seenVariantMappingIds.add(String(mapping.id));
    // Provider IDs and raw payloads belong in provider_variant_mappings. Only
    // actual customer choices belong in product_variants.options.
    const incomingShopperOptions = shopperVariantOptions(variant.options);

    if (variantId) {
      const { data: existingVariant, error: variantReadError } = await admin
        .from("product_variants")
        .select("options")
        .eq("id", variantId)
        .single();
      if (variantReadError) throw new Error(variantReadError.message);
      const update = await admin.from("product_variants").update({
        options: {
          ...shopperVariantOptions(existingVariant?.options),
          ...incomingShopperOptions,
        },
        is_active: variant.active,
        track_inventory: false,
        allow_backorder: variant.active,
        updated_at: now,
      }).eq("id", variantId);
      if (update.error) throw new Error(update.error.message);
    } else {
      const createdVariant = await admin.from("product_variants").insert({
        product_id: productId,
        title: variant.title,
        sku: variant.externalSku,
        price_cents: variant.suggestedRetailCents ?? product.suggestedRetailCents ?? 0,
        currency: variant.currency,
        weight_grams: variant.weightGrams,
        position: nextAppendPosition++,
        is_active: variant.active,
        track_inventory: false,
        allow_backorder: variant.active,
        inventory_qty: 0,
        options: incomingShopperOptions,
      }).select("id").single();
      if (createdVariant.error || !createdVariant.data?.id) {
        throw new Error(createdVariant.error?.message ?? "Shop variant creation failed");
      }
      variantId = String(createdVariant.data.id);
    }

    const inventoryLookup = await admin.from("inventory").select("id").eq("variant_id", variantId).maybeSingle();
    if (inventoryLookup.error) throw new Error(inventoryLookup.error.message);
    const inventoryValues = {
      quantity: 0,
      track_inventory: false,
      allow_backorder: variant.active,
      updated_at: now,
    };
    const inventoryWrite = inventoryLookup.data?.id
      ? await admin.from("inventory").update(inventoryValues).eq("id", inventoryLookup.data.id)
      : await admin.from("inventory").insert({ variant_id: variantId, ...inventoryValues });
    if (inventoryWrite.error) throw new Error(inventoryWrite.error.message);

    const mappingValues = {
      provider_id: providerId,
      product_id: productId,
      variant_id: variantId,
      external_product_id: product.externalProductId,
      external_variant_id: variant.externalVariantId,
      external_sku: variant.externalSku,
      active: variant.active,
      provider_cost_cents: variant.providerCostCents,
      provider_cost_currency: variant.providerCostCurrency,
      source_updated_at: variant.sourceUpdatedAt,
      last_seen_at: now,
      raw_payload: variant.raw,
      updated_at: now,
    };
    // Update the resolved mapping in place so a vendor-side SKU or ID rename
    // does not collide with the unique provider-to-Shop-variant relationship.
    const mappingWrite = mapping?.id
      ? await admin.from("provider_variant_mappings").update(mappingValues).eq("id", mapping.id).select("id").single()
      : await admin.from("provider_variant_mappings").insert(mappingValues).select("id").single();
    if (mappingWrite.error || !mappingWrite.data?.id) {
      throw new Error(mappingWrite.error?.message ?? "Provider variant mapping failed");
    }
    seenVariantMappingIds.add(String(mappingWrite.data.id));
  }

  const { data: allMappings, error: allMappingsError } = await admin
    .from("provider_variant_mappings")
    .select("id, variant_id")
    .eq("provider_id", providerId)
    .eq("product_id", productId);
  if (allMappingsError) throw new Error(allMappingsError.message);
  for (const mapping of allMappings ?? []) {
    if (seenVariantMappingIds.has(String(mapping.id))) continue;
    await admin.from("provider_variant_mappings").update({ active: false, updated_at: now }).eq("id", mapping.id);
    await admin.from("product_variants").update({ is_active: false, updated_at: now }).eq("id", mapping.variant_id);
  }

  const imageResult = await importVendorImages(admin, {
    provider,
    productId,
    externalProductId: product.externalProductId,
    title: product.title,
    urls: product.imageUrls,
    altByUrl: product.imageAltByUrl,
  });
  await reconcileProviderArtworkVariants(admin, productId);
  const needsReview = created || product.suggestedRetailCents == null || imageResult.errors.length > 0;
  const providerProductWrite = await admin.from("provider_products").upsert({
    provider_id: providerId,
    product_id: productId,
    external_product_id: product.externalProductId,
    external_saved_design_id: product.externalSavedDesignId,
    sync_status: needsReview ? "needs_review" : "synced",
    raw_payload: product.raw,
    last_error: imageResult.errors.length ? imageResult.errors.join("; ").slice(0, 2000) : null,
    source_hash: sourceHash(product),
    source_updated_at: product.sourceUpdatedAt,
    last_seen_at: now,
    last_seen_sync_id: runId,
    removed_at: null,
    updated_at: now,
  }, { onConflict: "provider_id,external_product_id" });
  if (providerProductWrite.error) throw new Error(providerProductWrite.error.message);

  return { created, productId, imageErrors: imageResult.errors };
}

async function archiveMissingProducts(
  admin: AdminClient,
  providerId: string,
  provider: CatalogProviderKey,
  runId: string,
) {
  const { data, error } = await admin
    .from("provider_products")
    .select("id, product_id, last_seen_sync_id, sync_status")
    .eq("provider_id", providerId)
    .not("product_id", "is", null);
  if (error) throw new Error(error.message);
  let archived = 0;
  const now = new Date().toISOString();
  for (const mapping of data ?? []) {
    if (mapping.last_seen_sync_id === runId || mapping.sync_status === "archived") continue;
    const providerUpdate = await admin.from("provider_products").update({
      sync_status: "archived",
      removed_at: now,
      updated_at: now,
    }).eq("id", mapping.id);
    if (providerUpdate.error) throw new Error(providerUpdate.error.message);
    const { data: shopProduct } = await admin.from("products").select("tags").eq("id", mapping.product_id).single();
    const tags = Array.isArray(shopProduct?.tags) ? shopProduct.tags.filter((tag: unknown): tag is string => typeof tag === "string") : [];
    await admin.from("products").update({
      status: "draft",
      tags: [...new Set([...tags, `provider-removed:${provider}`])],
      updated_at: now,
    }).eq("id", mapping.product_id);
    archived += 1;
  }
  return archived;
}

async function heartbeat(admin: AdminClient, runId: string, counts: CatalogSyncCounts) {
  await admin.from("provider_catalog_sync_runs").update({
    products_seen: counts.seen,
    products_created: counts.created,
    products_updated: counts.updated,
    products_archived: counts.archived,
    products_failed: counts.failed,
    heartbeat_at: new Date().toISOString(),
  }).eq("id", runId);
}

export async function runCatalogSync(input: {
  provider: CatalogProviderKey;
  trigger: CatalogTriggerKind;
  createdBy?: string | null;
}): Promise<CatalogSyncResult> {
  const adapter = createCatalogAdapter(input.provider);
  if (!adapter.configured) {
    throw new Error(`${adapter.label} catalog sync is not configured: ${adapter.missingConfiguration.join(", ")}`);
  }
  const admin = createAdminClient();
  const { data: providerRow, error: providerError } = await admin
    .from("fulfillment_providers")
    .select("id, status")
    .eq("provider_key", input.provider)
    .single();
  if (providerError || !providerRow?.id) {
    throw new Error(providerError?.message ?? `${adapter.label} provider row is missing`);
  }
  if (["paused", "disabled"].includes(providerRow.status)) {
    throw new Error(`${adapter.label} catalog sync is ${providerRow.status}`);
  }

  const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await admin.from("provider_catalog_sync_runs").update({
    status: "stale",
    completed_at: new Date().toISOString(),
    error_message: "Recovered after heartbeat exceeded 60 minutes",
  }).eq("provider_id", providerRow.id).eq("status", "running").lt("heartbeat_at", staleBefore);

  const runInsert = await admin.from("provider_catalog_sync_runs").insert({
    provider_id: providerRow.id,
    trigger_kind: input.trigger,
    status: "running",
    created_by: input.createdBy ?? null,
  }).select("id").single();
  if (runInsert.error || !runInsert.data?.id) {
    if (runInsert.error?.code === "23505") throw new Error(`${adapter.label} already has a running catalog sync`);
    throw new Error(runInsert.error?.message ?? "Could not acquire catalog sync lock");
  }

  const runId = String(runInsert.data.id);
  const counts: CatalogSyncCounts = { seen: 0, created: 0, updated: 0, archived: 0, failed: 0 };
  const errors: string[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  try {
    do {
      const page = await adapter.listPage(cursor);
      for (const product of page.products) {
        counts.seen += 1;
        try {
          const result = await upsertCatalogProduct(admin, providerRow.id, input.provider, runId, product);
          if (result.created) counts.created += 1;
          else counts.updated += 1;
          errors.push(...result.imageErrors.map((message) => `${product.title}: ${message}`));
        } catch (error) {
          counts.failed += 1;
          errors.push(`${product.title}: ${errorMessage(error)}`);
        }
        await heartbeat(admin, runId, counts);
      }
      cursor = page.nextCursor;
      pageCount += 1;
      if (pageCount > 100) throw new Error("Catalog pagination exceeded the 100-page safety limit");
    } while (cursor);

    // Never infer removals from an incomplete catalog traversal. A single failed
    // product could otherwise be mistaken for a provider-side deletion.
    if (counts.failed === 0) {
      counts.archived = await archiveMissingProducts(admin, providerRow.id, input.provider, runId);
    }
    const status = counts.failed > 0 || errors.length > 0 ? "partial" : "succeeded";
    await admin.from("provider_catalog_sync_runs").update({
      status,
      products_seen: counts.seen,
      products_created: counts.created,
      products_updated: counts.updated,
      products_archived: counts.archived,
      products_failed: counts.failed,
      error_message: errors.length ? errors.slice(0, 20).join("\n").slice(0, 8000) : null,
      heartbeat_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, provider: input.provider, status, ...counts, errors };
  } catch (error) {
    const message = errorMessage(error);
    errors.push(message);
    await admin.from("provider_catalog_sync_runs").update({
      status: "failed",
      products_seen: counts.seen,
      products_created: counts.created,
      products_updated: counts.updated,
      products_archived: counts.archived,
      products_failed: counts.failed,
      error_message: errors.slice(0, 20).join("\n").slice(0, 8000),
      heartbeat_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, provider: input.provider, status: "failed", ...counts, errors };
  }
}
