import { NextRequest, NextResponse } from "next/server";
import {
  apliiqWarehouseSchema,
  finishApliiqEvent,
  getApliiqProviderId,
  hasValidApliiqAppId,
  hasValidApliiqCallbackToken,
  recordApliiqEvent,
} from "@/lib/fulfillment/apliiq";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasValidApliiqCallbackToken(new URL(request.url))) {
    return NextResponse.json({ ok: false, error: "Unauthorized callback" }, { status: 401 });
  }
  if (!hasValidApliiqAppId(request.headers.get("x-apliiq-appid"))) {
    return NextResponse.json({ ok: false, error: "Invalid Apliiq app id" }, { status: 401 });
  }

  const rawBody = await request.text();
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be valid JSON" }, { status: 400 });
  }
  const parsed = apliiqWarehouseSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });

  const admin = createAdminClient();
  const providerId = await getApliiqProviderId();
  const receipt = await recordApliiqEvent({
    providerId,
    eventType: "warehouse.shipment.completed",
    rawBody,
    payload: parsed.data,
    signatureValid: true,
  });
  if (receipt.duplicate) return NextResponse.json({ ok: true, duplicate: true });

  try {
    for (const shipment of parsed.data) {
      const externalShipmentId = String(shipment.Id);
      const upserted = await admin.from("supplier_warehouse_shipments").upsert({
        provider_id: providerId,
        external_shipment_id: externalShipmentId,
        name: shipment.Name ?? null,
        status: shipment.Status || "completed",
        raw_payload: shipment,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider_id,external_shipment_id" }).select("id").single();
      if (upserted.error || !upserted.data) throw new Error(upserted.error?.message ?? "Warehouse shipment upsert failed");

      for (const item of shipment.Items) {
        const stored = await admin.from("supplier_warehouse_shipment_items").upsert({
          shipment_id: upserted.data.id,
          external_item_id: String(item.ID),
          inventory_id: item.InventoryId,
          sku: item.SKU ?? null,
          name: item.Name ?? null,
          item_type: item.Type ?? null,
          quantity_expected: item.Quantity ?? null,
          quantity_received: item.Quantity_Received ?? null,
          receiving_errors: item.Receiving_Errors ?? null,
          raw_payload: item,
        }, { onConflict: "shipment_id,external_item_id" });
        if (stored.error) throw new Error(stored.error.message);
      }
    }

    await finishApliiqEvent(providerId, receipt.dedupeKey, "processed");
    return NextResponse.json({ ok: true, shipmentsRecorded: parsed.data.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Warehouse callback failed";
    await finishApliiqEvent(providerId, receipt.dedupeKey, "failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
