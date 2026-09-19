import { NextRequest, NextResponse } from "next/server";
import {
  apliiqFulfillmentSchema,
  finishApliiqEvent,
  getApliiqProviderId,
  hasValidApliiqCallbackToken,
  recordApliiqEvent,
  verifyApliiqHmac,
} from "@/lib/fulfillment/apliiq";
import { sendOrderShippedEmail } from "@/lib/mail/sendOrderShipped";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertVendorDispatchAllowed } from "@/lib/fulfillment/dispatch-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidApliiqCallbackToken(new URL(request.url))) {
    return NextResponse.json({ ok: false, error: "Unauthorized callback" }, { status: 401 });
  }
  const rawBody = await request.text();
  if (!verifyApliiqHmac(rawBody, request.headers.get("x-apliiq-hmac"))) {
    return NextResponse.json({ ok: false, error: "Invalid callback signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be valid JSON" }, { status: 400 });
  }
  const parsed = apliiqFulfillmentSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });

  const admin = createAdminClient();
  const providerId = await getApliiqProviderId();
  const receipt = await recordApliiqEvent({
    providerId,
    eventType: "fulfillment.shipped",
    rawBody,
    payload: parsed.data,
    signatureValid: true,
  });
  if (receipt.duplicate) return NextResponse.json({ ok: true, duplicate: true });

  const fulfillment = parsed.data.fulfillment;
  const externalOrderId = String(fulfillment.order_id);
  try {
    const { data: supplierOrder } = await admin
      .from("supplier_fulfillment_orders")
      .select("id, order_id, payment_mode, provider_environment")
      .eq("provider_id", providerId)
      .eq("external_order_id", externalOrderId)
      .maybeSingle();

    if (!supplierOrder?.order_id) {
      await finishApliiqEvent(
        providerId,
        receipt.dedupeKey,
        "unmatched",
        `No previously accepted Apliiq dispatch matched ${externalOrderId}`,
      );
      return NextResponse.json({ ok: true, matched: false, externalOrderId });
    }
    const orderId = String(supplierOrder.order_id);
    assertVendorDispatchAllowed({
      stripeMode: supplierOrder.payment_mode,
      providerEnvironment: supplierOrder.provider_environment,
      providerSupportsSandbox: false,
      providerStatus: "active",
    });

    const supplierUpsert = await admin.from("supplier_fulfillment_orders").update({
      status: fulfillment.status,
      raw_payload: fulfillment,
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", supplierOrder.id);
    if (supplierUpsert.error) throw new Error(supplierUpsert.error.message);

    const { data: existingFulfillment } = await admin
      .from("fulfillments")
      .select("id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let fulfillmentId = existingFulfillment?.id ? String(existingFulfillment.id) : null;
    if (!fulfillmentId) {
      const created = await admin.from("fulfillments").insert({
        order_id: orderId,
        status: "fulfilled",
        note: `Apliiq fulfillment ${externalOrderId}`,
      }).select("id").single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Fulfillment create failed");
      fulfillmentId = String(created.data.id);
    } else {
      const updated = await admin.from("fulfillments").update({
        status: "fulfilled",
        updated_at: new Date().toISOString(),
      }).eq("id", fulfillmentId);
      if (updated.error) throw new Error(updated.error.message);
    }

    for (const lineItem of fulfillment.line_items) {
      const { data: orderItem } = await admin
        .from("order_items")
        .select("id")
        .eq("order_id", orderId)
        .eq("sku", lineItem.sku)
        .maybeSingle();
      if (!orderItem?.id) continue;
      const linked = await admin.from("fulfillment_items").upsert({
        fulfillment_id: fulfillmentId,
        order_item_id: orderItem.id,
        quantity: lineItem.quantity,
      }, { onConflict: "fulfillment_id,order_item_id" });
      if (linked.error) throw new Error(linked.error.message);
    }

    for (const [index, trackingNumber] of fulfillment.tracking_numbers.entries()) {
      const tracked = await admin.from("fulfillment_tracking").upsert({
        fulfillment_id: fulfillmentId,
        tracking_number: trackingNumber,
        tracking_url: fulfillment.tracking_urls[index] ?? fulfillment.tracking_urls[0] ?? null,
        carrier: fulfillment.tracking_company ?? null,
      }, { onConflict: "fulfillment_id,tracking_number" });
      if (tracked.error) throw new Error(tracked.error.message);
    }

    const firstTrackingNumber = fulfillment.tracking_numbers[0] ?? null;
    const firstTrackingUrl = fulfillment.tracking_urls[0] ?? null;
    const orderUpdate = await admin.from("orders").update({
      status: "fulfilled",
      shipped_at: new Date().toISOString(),
      tracking_number: firstTrackingNumber,
      tracking_url: firstTrackingUrl,
      shipping_provider_hint: "apliiq",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    if (orderUpdate.error) throw new Error(orderUpdate.error.message);

    await sendOrderShippedEmail(orderId, firstTrackingNumber, firstTrackingUrl);
    await finishApliiqEvent(providerId, receipt.dedupeKey, "processed");
    return NextResponse.json({ ok: true, matched: true, orderId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apliiq fulfillment callback failed";
    await finishApliiqEvent(providerId, receipt.dedupeKey, "failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
