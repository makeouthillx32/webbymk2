import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/images";
import {
  apliiqExternalProductId,
  apliiqProductSchema,
  apliiqWeightGrams,
  finishApliiqEvent,
  getApliiqProviderId,
  hasValidApliiqCallbackToken,
  isAllowedApliiqImageUrl,
  recordApliiqEvent,
  shopSlug,
  verifyApliiqHmac,
} from "@/lib/fulfillment/apliiq";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

function response(
  storeProductId: string | null,
  stepsCompleted: string[],
  errors: string[] = [],
  status = errors.length ? 422 : 200,
) {
  return NextResponse.json({
    storeProductId,
    stepsCompleted,
    hasError: errors.length > 0,
    errorMessages: errors,
  }, { status });
}

async function uniqueSlug(admin: ReturnType<typeof createAdminClient>, name: string, externalId: string) {
  const base = shopSlug(name);
  const suffix = createHash("sha256").update(externalId).digest("hex").slice(0, 8);
  const { data } = await admin.from("products").select("id").eq("slug", base).maybeSingle();
  return data ? `${base}-${suffix}` : base;
}

async function importImages(admin: ReturnType<typeof createAdminClient>, productId: string, urls: string[]) {
  let imported = 0;
  for (const [position, imageUrl] of [...new Set(urls)].slice(0, 12).entries()) {
    if (!isAllowedApliiqImageUrl(imageUrl)) continue;
    const remote = await fetch(imageUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!remote.ok) throw new Error(`Apliiq image returned HTTP ${remote.status}`);
    const contentType = remote.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!contentType.startsWith("image/")) throw new Error("Apliiq image response was not an image");
    const bytes = Buffer.from(await remote.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("Apliiq image exceeded 12 MB");
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const digest = createHash("sha256").update(imageUrl).digest("hex").slice(0, 24);
    const objectPath = `products/${productId}/vendors/apliiq/${digest}.${ext}`;
    const upload = await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(objectPath, bytes, {
      upsert: true,
      contentType,
      cacheControl: "86400",
    });
    if (upload.error) throw new Error(upload.error.message);
    const { data: existing } = await admin
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .eq("bucket_name", PRODUCT_IMAGE_BUCKET)
      .eq("object_path", objectPath)
      .maybeSingle();
    if (!existing) {
      const inserted = await admin.from("product_images").insert({
        product_id: productId,
        bucket_name: PRODUCT_IMAGE_BUCKET,
        object_path: objectPath,
        alt_text: null,
        is_public: true,
        is_primary: position === 0,
        sort_order: position,
        position,
        mime_type: contentType,
        size_bytes: bytes.byteLength,
      });
      if (inserted.error) throw new Error(inserted.error.message);
    }
    imported += 1;
  }
  return imported;
}

export async function POST(request: NextRequest) {
  if (!hasValidApliiqCallbackToken(new URL(request.url))) {
    return response(null, [], ["Unauthorized callback"], 401);
  }

  const rawBody = await request.text();
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return response(null, [], ["Body must be valid JSON"]);
  }
  const parsed = apliiqProductSchema.safeParse(json);
  if (!parsed.success) return response(null, [], [parsed.error.message]);

  const admin = createAdminClient();
  const providerId = await getApliiqProviderId();
  const signatureHeader = request.headers.get("x-apliiq-hmac");
  const signatureValid = signatureHeader ? verifyApliiqHmac(rawBody, signatureHeader) : true;
  if (!signatureValid) return response(null, [], ["Invalid callback signature"], 401);

  const receipt = await recordApliiqEvent({
    providerId,
    eventType: "product.added",
    rawBody,
    payload: parsed.data,
    signatureValid,
  });

  const externalProductId = apliiqExternalProductId(parsed.data);
  const { data: existingMap } = await admin
    .from("provider_products")
    .select("id, product_id")
    .eq("provider_id", providerId)
    .eq("external_product_id", externalProductId)
    .maybeSingle();
  if (receipt.duplicate && existingMap?.product_id) {
    return response(String(existingMap.product_id), ["Completed"]);
  }

  try {
    const priceCents = Math.round(Math.min(...parsed.data.variants.map((variant) => variant.price)) * 100);
    let productId = existingMap?.product_id ? String(existingMap.product_id) : null;
    if (!productId) {
      const slug = await uniqueSlug(admin, parsed.data.name, externalProductId);
      const created = await admin.from("products").insert({
        slug,
        title: parsed.data.name,
        description: parsed.data.description ?? null,
        price_cents: priceCents,
        currency: parsed.data.currency.toUpperCase(),
        brand: "Apliiq",
        tags: ["provider:apliiq", `apliiq:${externalProductId}`],
        status: "draft",
      }).select("id").single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Product create failed");
      productId = String(created.data.id);
    } else {
      const updated = await admin.from("products").update({
        title: parsed.data.name,
        description: parsed.data.description ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", productId);
      if (updated.error) throw new Error(updated.error.message);
    }

    const productMap = await admin.from("provider_products").upsert({
      provider_id: providerId,
      product_id: productId,
      external_product_id: externalProductId,
      sync_status: "needs_review",
      raw_payload: parsed.data,
      last_error: null,
      source_hash: createHash("sha256").update(rawBody).digest("hex"),
      last_seen_at: new Date().toISOString(),
      removed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider_id,external_product_id" });
    if (productMap.error) throw new Error(productMap.error.message);

    for (const [position, variant] of parsed.data.variants.entries()) {
      const { data: mapping } = await admin
        .from("provider_variant_mappings")
        .select("variant_id")
        .eq("provider_id", providerId)
        .eq("external_sku", variant.sku)
        .maybeSingle();
      const variantValues = {
        product_id: productId,
        title: [variant.size, variant.color].filter(Boolean).join(" / ") || "Default",
        sku: variant.sku,
        price_cents: Math.round(variant.price * 100),
        currency: parsed.data.currency.toUpperCase(),
        weight_grams: apliiqWeightGrams(variant.weight, variant.weightUnit),
        position,
        is_active: true,
        track_inventory: false,
        allow_backorder: true,
        inventory_qty: 0,
        // Fulfillment identity is stored in provider_variant_mappings below;
        // storefront options contain only choices a shopper should see.
        options: {
          size: variant.size ?? null,
          color: variant.color ?? null,
        },
        updated_at: new Date().toISOString(),
      };
      let variantId = mapping?.variant_id ? String(mapping.variant_id) : null;
      if (variantId) {
        const updated = await admin.from("product_variants").update(variantValues).eq("id", variantId);
        if (updated.error) throw new Error(updated.error.message);
      } else {
        const created = await admin.from("product_variants").insert(variantValues).select("id").single();
        if (created.error || !created.data) throw new Error(created.error?.message ?? "Variant create failed");
        variantId = String(created.data.id);
      }
      const { data: inventoryRow, error: inventoryLookupError } = await admin
        .from("inventory")
        .select("id")
        .eq("variant_id", variantId)
        .maybeSingle();
      if (inventoryLookupError) throw new Error(inventoryLookupError.message);
      const inventoryValues = {
        quantity: 0,
        track_inventory: false,
        allow_backorder: true,
        updated_at: new Date().toISOString(),
      };
      const inventoryWrite = inventoryRow?.id
        ? await admin.from("inventory").update(inventoryValues).eq("id", inventoryRow.id)
        : await admin.from("inventory").insert({ variant_id: variantId, ...inventoryValues });
      if (inventoryWrite.error) throw new Error(inventoryWrite.error.message);
      const mapped = await admin.from("provider_variant_mappings").upsert({
        provider_id: providerId,
        product_id: productId,
        variant_id: variantId,
        external_product_id: externalProductId,
        external_variant_id: variant.sku,
        external_sku: variant.sku,
        active: true,
        last_seen_at: new Date().toISOString(),
        raw_payload: variant,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider_id,external_sku" });
      if (mapped.error) throw new Error(mapped.error.message);
    }

    const imageCount = await importImages(admin, productId, [
      ...parsed.data.imageUrls,
      ...parsed.data.variants.map((variant) => variant.imageUrl).filter((value): value is string => Boolean(value)),
    ]);
    await admin.from("provider_products").update({ sync_status: "synced" }).eq("provider_id", providerId).eq("external_product_id", externalProductId);
    await finishApliiqEvent(providerId, receipt.dedupeKey, "processed");
    return response(productId, ["DraftCreated", "InventoryCreated", ...(imageCount ? ["ImagesUploaded"] : []), "Completed"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apliiq product import failed";
    await finishApliiqEvent(providerId, receipt.dedupeKey, "failed", message);
    return response(null, [], [message]);
  }
}
