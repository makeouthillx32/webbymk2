import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";

const optionalText = z.union([z.string(), z.number()]).nullish().transform((value) =>
  value == null ? null : String(value)
);

export const apliiqVariantSchema = z.object({
  sku: z.string().min(1).max(200),
  price: z.coerce.number().nonnegative(),
  color: z.string().nullish(),
  size: z.string().nullish(),
  imageUrl: z.string().url().nullish(),
  weight: z.coerce.number().nonnegative().nullish(),
  weightUnit: z.string().nullish(),
  default: z.boolean().nullish(),
  width: z.coerce.number().nonnegative().nullish(),
  height: z.coerce.number().nonnegative().nullish(),
  length: z.coerce.number().nonnegative().nullish(),
  dimensionUnit: z.string().nullish(),
}).passthrough();

export const apliiqProductSchema = z.object({
  store_ProductId: optionalText,
  shippingProfileId: optionalText,
  type: z.string().nullish(),
  name: z.string().min(1).max(240),
  currency: z.string().length(3).default("USD"),
  taxonomyId: optionalText,
  description: z.string().nullish(),
  imageUrls: z.array(z.string().url()).default([]),
  replaceProduct: z.boolean().default(false),
  sizes: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  variants: z.array(apliiqVariantSchema).min(1),
}).passthrough();

export const apliiqFulfillmentSchema = z.object({
  fulfillment: z.object({
    order_id: optionalText.refine(Boolean, "order_id is required"),
    status: z.string().default("success"),
    tracking_company: z.string().nullish(),
    tracking_numbers: z.array(z.string()).default([]),
    tracking_urls: z.array(z.string()).default([]),
    line_items: z.array(z.object({
      id: optionalText,
      quantity: z.coerce.number().int().positive().default(1),
      sku: z.string().min(1),
      name: z.string().nullish(),
    }).passthrough()).default([]),
  }).passthrough(),
}).passthrough();

export const apliiqWarehouseSchema = z.array(z.object({
  Id: z.union([z.string(), z.number()]),
  Name: z.string().nullish(),
  Status: z.string().nullish(),
  Items: z.array(z.object({
    ID: z.union([z.string(), z.number()]),
    InventoryId: optionalText,
    SKU: z.string().nullish(),
    Name: z.string().nullish(),
    Type: z.string().nullish(),
    Quantity: z.coerce.number().int().nullish(),
    Quantity_Received: z.coerce.number().int().nullish(),
    Receiving_Errors: z.string().nullish(),
  }).passthrough()).default([]),
}).passthrough());

function safeEqual(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hasValidApliiqCallbackToken(url: URL) {
  return safeEqual(url.searchParams.get("token"), process.env.APLIIQ_CALLBACK_TOKEN);
}

export function hasValidApliiqAppId(value: string | null) {
  return safeEqual(value, process.env.APLIIQ_APP_ID);
}

export function verifyApliiqHmac(rawBody: string, supplied: string | null) {
  const secret = process.env.APLIIQ_SHARED_SECRET;
  if (!secret || !supplied) return false;
  const encodedPayload = Buffer.from(rawBody, "utf8").toString("base64");
  const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64");
  return safeEqual(supplied, expected);
}

export function apliiqDedupeKey(eventType: string, rawBody: string) {
  return `${eventType}:${createHash("sha256").update(rawBody).digest("hex")}`;
}

export function apliiqExternalProductId(payload: z.infer<typeof apliiqProductSchema>) {
  if (payload.store_ProductId) return payload.store_ProductId;
  const skus = payload.variants.map((variant) => variant.sku).sort().join("|");
  return `saved-design:${createHash("sha256").update(skus).digest("hex").slice(0, 24)}`;
}

export function shopSlug(value: string) {
  return value
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "apliiq-product";
}

export function apliiqWeightGrams(weight: number | null | undefined, unit: string | null | undefined) {
  if (weight == null) return null;
  const normalized = unit?.toLowerCase();
  if (normalized === "oz" || normalized === "ounce" || normalized === "ounces") {
    return Math.round(weight * 28.349523125);
  }
  if (normalized === "lb" || normalized === "pound" || normalized === "pounds") {
    return Math.round(weight * 453.59237);
  }
  if (normalized === "kg") return Math.round(weight * 1000);
  return Math.round(weight);
}

export async function getApliiqProviderId() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fulfillment_providers")
    .select("id")
    .eq("provider_key", "apliiq")
    .single();
  if (error || !data?.id) throw new Error(error?.message ?? "Apliiq provider is not configured");
  return String(data.id);
}

export async function recordApliiqEvent(input: {
  providerId: string;
  eventType: string;
  rawBody: string;
  payload: unknown;
  signatureValid: boolean;
}) {
  const admin = createAdminClient();
  const dedupeKey = apliiqDedupeKey(input.eventType, input.rawBody);
  const { data, error } = await admin
    .from("supplier_webhook_events")
    .upsert({
      provider_id: input.providerId,
      event_type: input.eventType,
      dedupe_key: dedupeKey,
      signature_valid: input.signatureValid,
      payload: input.payload,
      processing_status: "received",
    }, { onConflict: "provider_id,dedupe_key", ignoreDuplicates: true })
    .select("id, processing_status")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { event: data, dedupeKey, duplicate: false };

  const { data: existing, error: existingError } = await admin
    .from("supplier_webhook_events")
    .select("id, processing_status")
    .eq("provider_id", input.providerId)
    .eq("dedupe_key", dedupeKey)
    .single();
  if (existingError) throw new Error(existingError.message);
  return {
    event: existing,
    dedupeKey,
    duplicate: existing.processing_status === "processed",
  };
}

export async function finishApliiqEvent(
  providerId: string,
  dedupeKey: string,
  status: "processed" | "unmatched" | "failed",
  errorMessage?: string,
) {
  const admin = createAdminClient();
  await admin
    .from("supplier_webhook_events")
    .update({
      processing_status: status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("provider_id", providerId)
    .eq("dedupe_key", dedupeKey);
}

export function isAllowedApliiqImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "blob.apliiq.com";
  } catch {
    return false;
  }
}
